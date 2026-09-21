/* ======================================================================
   FontanClinic — UI. All data stays in this browser tab; nothing is sent anywhere.
   ====================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const state = { data: {}, pstatus: {}, src: {}, conflicts: {}, ref: {}, labAbn: [], notesBySrc: {}, counts: {},
  boxSources: {}, lastEad: "", tab: "overview", query: "", letter: "", letterAuto: "", D: {}, flags: [], dirty: false };
const SOURCES = [
  ["cpet", "CPETechoPVP", "Inspanningsecho … Besluit"],
  ["consult", "Raadpleging (KWS)", "Diagnose – antecedenten, behandeling, reden van consultatie, klinisch onderzoek, ECG, echocardiografie"],
  ["lab", "Labo", "Hematologie, chemie, stolling, tumormerkers …"],
  ["liver", "Echo lever", "Echografie van de lever … Conclusie"],
];

const TABS = [
  { id: "overview", label: "Overzicht" },
  { id: "header", label: "Bezoek" },
  { id: "cv", label: "Cardiovasculair", circuit: ["cv"] },
  { id: "pulm", label: "Pulmonaal", circuit: ["pulm"] },
  { id: "periph", label: "Perifeer", circuit: ["periph"] },
  { id: "endorgan", label: "Eind-orgaan", circuit: ENDORGAN },
  { id: "psych", label: "Psychosociaal", circuit: ["psych"] },
  { id: "plan", label: "Beleid" },
  { id: "letter", label: "Brief & export" },
  { id: "tools", label: "Instellingen & bundelen" },
];
const STATUS_TXT = { abn: "afwijkend", warn: "controleren", ok: "normaal", na: "onvolledig", info: "informatief" };

/* ---------------------------------------------------------------- utils */
function parseNum(s) {
  const t = String(s).trim().replace(",", ".");
  if (t === "") return null;
  return /^-?\d*\.?\d+$/.test(t) ? parseFloat(t) : NaN;
}
function fmtNum(v, f) {
  if (v === null || v === undefined || v === "") return "";
  const s = String(+Number(v).toFixed(Math.max(f.dec, 3)));
  return CONFIG.DECIMAL_COMMA ? s.replace(".", ",") : s;
}
function worst(fl) {
  fl = fl.filter(x => x.status !== "info");
  if (!fl.length) return "na";
  for (const s of ["abn", "warn", "ok"]) if (fl.some(x => x.status === s)) return s;
  return "na";
}
function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function toast(msg, kind = "") {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show " + kind;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = "toast", 2600);
}
function visitFilename(ext) {
  const ead = String(state.data.ead || "EAD").replace(/\s+/g, "");
  const ds = state.data.visit_date ? state.data.visit_date.replace(/-/g, "") : "datum";
  return `${ead}_${ds}.${ext}`;
}

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const labUnit = u => String(u || "").replace(/^10(\d{1,2})\/L$/, (m, e) => "×10" + [...e].map(c => SUP[c]).join("") + "/L");

/* ---------------------------------------------------------------- field widgets */
function fieldHTML(f, showDomain = false) {
  const id = "f_" + f.key, v = state.data[f.key], ps = state.pstatus[f.key], sn = SRC_NAME[state.src[f.key]] || "";
  const dot = ps ? `<span class="pdot ${ps}" title="uit ${sn}${ps === "ambiguous" ? " — voorstel, controleren" : ""}"></span>`
    : state.src[f.key] === "prev" ? `<span class="pdot prev" title="overgenomen van vorig bezoek"></span>` : "";
  const dom = showDomain ? `<span class="fdom">${esc(DOMAIN_LABEL[f.domain])}</span>` : "";
  const help = f.help ? ` title="${esc(f.help)}"` : "";
  const lab = `<label for="${id}"${help}>${dot}${esc(f.label)}${dom}</label>`;
  let input;
  switch (f.kind) {
    case "num":
      input = `<div class="numwrap"><input id="${id}" data-k="${f.key}" inputmode="decimal" autocomplete="off" value="${esc(fmtNum(v, f))}">${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ""}</div>`; break;
    case "text":
      input = `<input id="${id}" data-k="${f.key}" autocomplete="off" value="${esc(v ?? "")}" placeholder="${esc(f.help)}">`; break;
    case "longtext":
      input = `<textarea id="${id}" data-k="${f.key}" rows="2" placeholder="${esc(f.help)}">${esc(v ?? "")}</textarea>`; break;
    case "date":
      input = `<input id="${id}" data-k="${f.key}" type="date" value="${esc(v ?? "")}">`; break;
    case "select": {
      const opts = [...f.options]; if (v && !opts.includes(v)) opts.push(v);
      input = `<select id="${id}" data-k="${f.key}">${opts.map(o => `<option value="${esc(o)}"${o === (v ?? "") ? " selected" : ""}>${o ? esc(o) : "—"}</option>`).join("")}</select>`; break;
    }
    case "multi": {
      const sel = v || [];
      input = `<div class="chips" id="${id}" role="group" aria-label="${esc(f.label)}">${f.options.map(o =>
        `<button type="button" class="chip${sel.includes(o) ? " on" : ""}" data-k="${f.key}" data-o="${esc(o)}" aria-pressed="${sel.includes(o)}">${esc(o)}</button>`).join("")}</div>`; break;
    }
  }
  const wide = f.kind === "longtext" || f.kind === "multi" ? " wide" : "";
  return `<div class="field${wide}${f.source === "cpet" ? " cpet" : ""}">${lab}${input}</div>`;
}
function fieldsHTML(fields, showDomain = false) {
  const groups = new Map();
  for (const f of fields) { if (!groups.has(f.group)) groups.set(f.group, []); groups.get(f.group).push(f); }
  let h = "";
  for (const [gname, fs] of groups) {
    h += `<section class="group">${gname ? `<h3>${esc(gname)}</h3>` : ""}<div class="grid">${fs.map(f => fieldHTML(f, showDomain)).join("")}</div></section>`;
  }
  return h;
}

/* ---------------------------------------------------------------- views */
function viewOverview() {
  const d = state.data, D = state.D, v = (k, dec = 1) => d[k] === undefined || d[k] === null || d[k] === "" ? "—" : n(d[k], dec);
  const ref = CONFIG.VO2_PRED_REFERENCE[0].toUpperCase() + CONFIG.VO2_PRED_REFERENCE.slice(1);
  const metric = (label, value, sub = "") => `<div class="metric"><div class="mv">${value}</div><div class="ml">${label}${sub ? ` <span>${sub}</span>` : ""}</div></div>`;
  let h = `<div class="metrics">
    ${metric("Piek VO2 ml/kg/min", v("vo2kg_peak"), D.d_vo2_pct_friend !== undefined ? `${n(D.d_vo2_pct_friend, 0)}% FRIEND` : "")}
    ${metric("PVP rust / piek mmHg", `${v("pvp_rest")} / ${v("pvp_peak")}`)}
    ${metric("PVP-CO slope", D.d_pvp_co_slope !== undefined ? n(D.d_pvp_co_slope) : "—", "mmHg/L/min")}
    ${metric("PVP@33% VO2pred", D.d_pvp_at_x !== undefined ? n(D.d_pvp_at_x) : "—", "mmHg")}
    ${metric("ΔSVi rust→piek", D.d_dsvi_pct !== undefined ? `${D.d_dsvi_pct >= 0 ? "+" : "−"}${n(Math.abs(D.d_dsvi_pct), 0)}%` : "—")}
    ${metric("SpO2 rust→piek", `${v("spo2_rest", 0)}→${v("spo2_peak", 0)}`, "%")}
    ${metric("VE/VCO2 slope", v("ve_vco2_slope"), D.d_vent_class ? `klasse ${D.d_vent_class}` : "")}
  </div><div class="domains">`;
  for (const dom of ["src", "cv", "pulm", "periph", ...ENDORGAN]) {
    const fl = state.flags.filter(x => x.domain === dom);
    if (!fl.length) continue;
    const w = worst(fl);
    h += `<article class="dbox s-${w}${dom === "src" ? " srcbox" : ""}"><h3><span class="sdot s-${w}"></span>${esc(FLAG_DOMAIN_LABEL[dom])}</h3><ul>` +
      fl.map(x => `<li class="s-${x.status}"><span class="sdot s-${x.status}" title="${STATUS_TXT[x.status]}"></span><div><b>${esc(x.item)}</b> ${esc(x.value)}${x.note ? `<small>${esc(x.note)}</small>` : ""}</div></li>`).join("") +
      `</ul></article>`;
  }
  if (state.labAbn.length) h += `<article class="dbox s-na"><h3><span class="sdot"></span>Labo buiten referentie${d.lab_date ? ` <small class="muted">${esc(d.lab_date)}</small>` : ""}</h3><ul>` +
    state.labAbn.map(a => `<li><span class="sdot s-abn"></span><div><b>${esc(a.name)}</b> ${esc(n(a.value, String(a.value).includes(".") ? String(a.value).split(".")[1].length : 0))} ${esc(labUnit(a.unit))}<small>ref. ${esc(a.range)}</small></div></li>`).join("") + `</ul></article>`;
  h += `</div>`;
  if (d.cpet_besluit) h += `<details class="lab"><summary>Besluit van het CPET-labo (ter vergelijking)</summary><pre>${esc(d.cpet_besluit)}\n\n${esc(d.cpet_conclusion || "")}</pre></details>`;
  if (!Object.keys(state.pstatus).length) h = `<div class="empty">Plak de verslagen in de vakken hierboven — ze worden meteen ingelezen. De stoplichten per domein verschijnen hier.</div>` + h;
  return h;
}
function viewLetter() {
  const edited = state.letter !== state.letterAuto;
  const okId = state.data.ead && state.data.visit_date;
  return `<div class="letterbar">
      <button class="btn primary" id="btnCopy">Kopieer naar KWS</button>
      <button class="btn" id="btnDocx"${okId ? "" : " disabled"}>Download Word</button>
      <button class="btn" id="btnXlsx"${okId ? "" : " disabled"}>Download Excel (1 rij)</button>
      <button class="btn ghost" id="btnRegen">Brief opnieuw opbouwen</button>
    </div>
    <p class="hint" id="letterHint">${edited ? "Handmatig bewerkt — wijzigingen in de invoer worden pas verwerkt na ‘Brief opnieuw opbouwen’."
      : "De brief volgt de invoer automatisch. Bewerk vrij; kopiëren en exports gebruiken de bewerkte tekst."}</p>
    ${okId ? "" : `<p class="hint warn">Vul EAD nr en datum bezoek in (bovenaan) om Word en Excel te downloaden.</p>`}
    <textarea id="letterText" spellcheck="true" lang="nl">${esc(state.letter)}</textarea>`;
}
function viewTools() {
  return `<section class="group"><h3>Instellingen</h3><ul class="plain">${settingsSummary().map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="hint">Aan te passen bovenaan in dit bestand (blok <code>CONFIG</code>).</p></section>
    <section class="group"><h3>Bezoekfiles bundelen voor analyse</h3>
    <p class="hint">Selecteer meerdere één-rij bezoekfiles (.xlsx). Dubbels (zelfde EAD + datum) houden de meest recente file.</p>
    <label class="btn file">Kies bezoekfiles…<input type="file" id="mergeFiles" accept=".xlsx" multiple hidden></label>
    <p class="hint" id="mergeResult"></p></section>
    <section class="group"><h3>Privacy</h3><p class="hint">Dit bestand werkt volledig offline. Gegevens blijven in dit browservenster en verdwijnen bij sluiten; bewaar via de Excel-export.</p></section>`;
}
function render() {
  const main = $("#view");
  if (state.query) {
    const res = searchFields(state.query);
    main.innerHTML = `<p class="hint">${res.length} velden voor ‘${esc(state.query)}’ — Esc om te sluiten</p>` + (res.length ? fieldsHTML(res, true) : "");
  } else {
    const t = state.tab;
    if (t === "overview") main.innerHTML = viewOverview();
    else if (t === "endorgan") main.innerHTML = ENDORGAN.map(dom => `<details class="sub"${dom === "liver" ? " open" : ""}><summary>${esc(DOMAIN_LABEL[dom])}<span class="sdot s-${worst(state.flags.filter(x => x.domain === dom))}"></span></summary>${fieldsHTML(FIELDS.filter(f => f.domain === dom))}</details>`).join("");
    else if (t === "letter") main.innerHTML = viewLetter();
    else if (t === "tools") main.innerHTML = viewTools();
    else main.innerHTML = fieldsHTML(FIELDS.filter(f => f.domain === t && !["ead", "visit_date"].includes(f.key)));
  }
  renderTabs();
}
function renderTabs() {
  $("#tabs").innerHTML = TABS.map(t => {
    const st = t.circuit ? worst(state.flags.filter(x => t.circuit.includes(x.domain))) : null;
    return `<button role="tab" class="tab${t.circuit ? " circ s-" + st : ""}${state.tab === t.id && !state.query ? " active" : ""}" data-tab="${t.id}" aria-selected="${state.tab === t.id}"${st ? ` title="${STATUS_TXT[st]}"` : ""}>${esc(t.label)}</button>`;
  }).join("");
}

/* ---------------------------------------------------------------- refresh (after data change) */
function refresh() {
  state.data._ref = state.ref; state.data._conflicts = state.conflicts;
  const r = compute(state.data); state.D = r.D; state.flags = r.flags;
  const fresh = buildLetter(state.data, state.D);
  if (!state.letter || state.letter === state.letterAuto) {
    state.letter = fresh;
    const ta = $("#letterText"); if (ta && document.activeElement !== ta) ta.value = fresh;
  }
  state.letterAuto = fresh;
  renderTabs();
  if (!state.query && state.tab === "overview") $("#view").innerHTML = viewOverview();
  $("#hdrEad").value = state.data.ead || ""; $("#hdrDate").value = state.data.visit_date || "";
  for (const b of ["#btnDocx", "#btnXlsx"]) { const el = $(b); if (el) el.disabled = !(state.data.ead && state.data.visit_date); }
}

/* ---------------------------------------------------------------- exports */
function visitXlsx() {
  const keys = [...FIELDS.map(f => f.key), ...Object.keys(DERIVED_META)];
  const val = k => { const v = k in DERIVED_META ? state.D[k] : state.data[k]; return Array.isArray(v) ? v.join("; ") : (v ?? ""); };
  const visit = { name: "visit", boldFirstRow: true, freeze: [2, 1], dateCols: new Set([keys.indexOf("visit_date")]),
    rows: [keys, keys.map(val)], widths: keys.map(k => Math.max(10, Math.min(28, k.length + 2))) };
  const cb = [["variable", "label", "domain", "unit", "expected_source", "value_source", "carry_forward", "parse_status", "options"]];
  for (const f of FIELDS) cb.push([f.key, f.label, DOMAIN_LABEL[f.domain], f.unit, f.source, state.data[f.key] !== undefined && state.data[f.key] !== "" && state.data[f.key] !== null ? (state.src[f.key] || "manual") : "",
    f.cf ? 1 : 0, state.pstatus[f.key] || "", (f.options || []).filter(Boolean).join("; ")]);
  for (const [k, [l, dom, u]] of Object.entries(DERIVED_META)) cb.push([k, l, DOMAIN_LABEL[dom], u, "derived", "derived", 0, "", ""]);
  const settings = [["exported", new Date().toISOString().slice(0, 16).replace("T", " ")], ["vo2_pred_reference", CONFIG.VO2_PRED_REFERENCE],
    ["pvp_at", JSON.stringify(CONFIG.PVP_AT)], ["pvp_slope_method", CONFIG.PVP_SLOPE_METHOD], ["exercise_mode", "cycle (2)"],
    ["two_value_stages", CONFIG.TWO_VALUE_STAGES.join(",")]];
  return xlsxBlob([visit, { name: "codebook", boldFirstRow: true, rows: cb, widths: [22, 48, 18, 14, 14, 13, 13, 12, 60] },
    { name: "settings", rows: settings, widths: [20, 60] }]);
}
async function prefill(file) {
  const rows = await readXlsxRows(await file.arrayBuffer(), "visit");
  const [head, vals] = [rows[0] || [], rows[1] || []];
  const fileEad = head.includes("ead") ? String(vals[head.indexOf("ead")] ?? "").trim() : "";
  if (fileEad && state.data.ead && fileEad !== String(state.data.ead) && hasOtherData()) {
    if (!confirm(`Deze file is van EAD ${fileEad}, het huidige bezoek van EAD ${state.data.ead}. Huidige gegevens wissen en overnemen?`)) return;
    clearAll({ visit_date: state.data.visit_date });
  }
  let nPrev = 0;
  head.forEach((h, i) => {
    const f = FIELD[h], v = vals[i];
    if (!f || v === null || v === undefined || v === "") return;
    if (h === "ead") { state.data.ead = String(v); state.lastEad = String(v); return; }
    if (!f.cf) return;
    state.data[h] = f.kind === "multi" ? String(v).split(";").map(s => s.trim()).filter(Boolean) : (f.kind === "num" ? Number(v) : String(v));
    state.src[h] = "prev"; delete state.pstatus[h]; nPrev++;
  });
  state.dirty = true; state.letter = "";
  refresh(); render(); toast(`${nPrev} statische velden overgenomen van ${file.name}`);
}
async function mergeFiles(files) {
  const recs = [], cols = new Set();
  for (const file of files) {
    try {
      const rows = await readXlsxRows(await file.arrayBuffer(), "visit");
      const head = rows[0] || [];
      for (const r of rows.slice(1)) {
        if (!r || !r.some(x => x !== null && x !== undefined && x !== "")) continue;
        const o = { _source_file: file.name, _mtime: file.lastModified };
        head.forEach((h, i) => { if (h) { o[h] = r[i] ?? ""; cols.add(h); } });
        if (o.visit_date !== "" && o.visit_date !== undefined) o.visit_date = serialToIso(o.visit_date);
        recs.push(o);
      }
    } catch (e) { toast(`Overgeslagen: ${file.name}`, "bad"); }
  }
  if (!recs.length) { $("#mergeResult").textContent = "Geen bezoekrijen gevonden."; return; }
  recs.sort((a, b) => a._mtime - b._mtime);
  const byKey = new Map(); for (const r of recs) byKey.set(`${r.ead}|${r.visit_date}`, r);
  const out = [...byKey.values()].sort((a, b) => String(a.ead).localeCompare(String(b.ead)) || String(a.visit_date).localeCompare(String(b.visit_date)));
  const order = [...FIELDS.map(f => f.key), ...Object.keys(DERIVED_META)];
  const keys = [...order.filter(k => cols.has(k)), ...[...cols].filter(k => !order.includes(k)), "_source_file"];
  const rows = [keys, ...out.map(r => keys.map(k => r[k] ?? ""))];
  download(xlsxBlob([{ name: "visits", boldFirstRow: true, freeze: [2, 1], rows, dateCols: new Set([keys.indexOf("visit_date")]) }]), "fontan_visits_master.xlsx");
  $("#mergeResult").textContent = `${out.length} bezoeken (${new Set(out.map(r => r.ead)).size} patiënten) gebundeld in fontan_visits_master.xlsx`;
}
async function copyLetter() {
  const txt = state.letter;
  try { await navigator.clipboard.writeText(txt); }
  catch { const ta = $("#letterText"); ta.focus(); ta.select(); document.execCommand("copy"); }
  toast("Brief gekopieerd — plak in KWS");
}

/* ---------------------------------------------------------------- events */
function onFieldInput(el) {
  const k = el.dataset.k, f = FIELD[k];
  if (f.kind === "num") {
    const v = parseNum(el.value);
    el.classList.toggle("invalid", Number.isNaN(v));
    state.data[k] = Number.isNaN(v) ? null : v;
  } else state.data[k] = el.value;
  state.src[k] = "manual"; delete state.pstatus[k]; delete state.conflicts[k];
  const dot = el.closest(".field")?.querySelector(".pdot"); if (dot) dot.remove();
  state.dirty = true; refresh();
}
function clearSource(s) {
  for (const k of Object.keys(state.src)) if (state.src[k] === s) { delete state.data[k]; delete state.src[k]; delete state.pstatus[k]; delete state.conflicts[k]; }
  delete state.counts[s]; delete state.notesBySrc[s];
  if (s === "lab") { state.ref = {}; state.labAbn = []; }
}
function ingest(box, text) {
  for (const s of state.boxSources[box] || []) clearSource(s);   // re-paste replaces what this field produced before
  state.boxSources[box] = [];
  if (!text.trim()) { renderSources(); refresh(); render(); return; }
  const parts = splitSources(text) || { [box]: text };
  state.boxSources[box] = Object.keys(parts);
  const found = Object.keys(parts);
  if (found.length > 1 || found[0] !== box) toast(`Herkend in dit vak: ${found.map(s => SRC_NAME[s]).join(", ")} — elk apart ingelezen`);
  for (const [s, t] of Object.entries(parts)) {
    const r = parseAny(s, t);
    mergeParsed(state, r, s);
    state.counts[s] = Object.keys(r.values).length;
    state.notesBySrc[s] = r.notes;
    if (r.ref) Object.assign(state.ref, r.ref);
    if (r.abnormal) state.labAbn = r.abnormal;
  }
  state.dirty = true;
  renderSources(); refresh(); render();
}
function renderSources() {
  for (const [s] of SOURCES) {
    const el = $("#stat_" + s), c = state.counts[s];
    const amb = Object.entries(state.pstatus).filter(([k, v]) => v === "ambiguous" && state.src[k] === s).length;
    el.innerHTML = c === undefined ? "nog niet ingelezen" : `<b>${c}</b> velden${amb ? ` · <b>${amb}</b> voorstel${amb > 1 ? "len" : ""} <span class="pdot ambiguous"></span>` : ""}`;
    el.closest(".srccard").classList.toggle("done", c !== undefined);
  }
  $("#parseSummary").innerHTML = SOURCES.filter(([s]) => state.counts[s] !== undefined).map(([s, l]) => `<span class="chipsum">${esc(l)} ${state.counts[s]}</span>`).join("");
  $("#notes").innerHTML = Object.entries(state.notesBySrc).flatMap(([s, ns]) => ns.map(x => `<li><b>${esc(SRC_NAME[s])}:</b> ${esc(x)}</li>`)).join("");
}
function hasOtherData() {
  return Object.entries(state.data).some(([k, v]) => !["ead", "visit_date", "_ref", "_conflicts"].includes(k) && !(v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)));
}
function clearAll(keep = {}) {
  Object.assign(state, { data: { ...keep }, pstatus: {}, src: {}, conflicts: {}, ref: {}, labAbn: [], notesBySrc: {}, counts: {}, boxSources: {}, letter: "", letterAuto: "", dirty: false, query: "", tab: "overview" });
  document.querySelectorAll(".srccard textarea").forEach(t => t.value = ""); $("#search").value = ""; $("#pastePanel").open = true;
  renderSources(); refresh(); render();
}
function onEadChange(newEad) {
  const prev = state.lastEad;
  if (prev && newEad && newEad !== prev && hasOtherData()) {
    if (confirm(`Nieuwe EAD (${newEad}): alle andere velden en verslagen wissen?`)) clearAll({ ead: newEad, visit_date: state.data.visit_date });
  }
  state.lastEad = newEad;
}
function resetAll() {
  if (state.dirty && !confirm("Alle ingevulde gegevens wissen en een nieuw bezoek starten?")) return;
  Object.assign(state, { data: {}, pstatus: {}, src: {}, conflicts: {}, ref: {}, labAbn: [], notesBySrc: {}, counts: {}, boxSources: {}, lastEad: "", letter: "", letterAuto: "", dirty: false, query: "", tab: "overview" });
  document.querySelectorAll(".srccard textarea").forEach(t => t.value = ""); $("#search").value = ""; $("#pastePanel").open = true;
  renderSources();
  refresh(); render();
}

document.addEventListener("DOMContentLoaded", () => {
  $("#srcGrid").innerHTML = SOURCES.map(([s, l, ph]) => `<div class="srccard" data-src="${s}"><div class="srchead"><label for="paste_${s}">${esc(l)}</label><span class="srcstat" id="stat_${s}"></span></div>
    <textarea id="paste_${s}" data-src="${s}" spellcheck="false" placeholder="${esc(ph)}"></textarea></div>`).join("");
  let deb = {};
  $("#srcGrid").addEventListener("input", e => {
    const s = e.target.dataset.src; if (!s) return;
    clearTimeout(deb[s]); deb[s] = setTimeout(() => ingest(s, e.target.value), 400);
  });
  renderSources();
  $("#btnReset").addEventListener("click", resetAll);
  $("#prevFile").addEventListener("change", e => { const f = e.target.files[0]; if (f) prefill(f).catch(err => toast(err.message, "bad")); e.target.value = ""; });
  $("#hdrEad").addEventListener("input", e => { state.data.ead = e.target.value.trim(); state.dirty = true; refresh(); });
  $("#hdrEad").addEventListener("change", e => onEadChange(e.target.value.trim()));
  $("#hdrDate").addEventListener("input", e => { state.data.visit_date = e.target.value; state.dirty = true; refresh(); });
  $("#search").addEventListener("input", e => { state.query = e.target.value; render(); });
  $("#search").addEventListener("keydown", e => { if (e.key === "Escape") { e.target.value = ""; state.query = ""; render(); } });
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#search").focus(); $("#search").select(); } });
  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    state.tab = b.dataset.tab; state.query = ""; $("#search").value = ""; render();
    $("#view").focus({ preventScroll: true });
  });
  const view = $("#view");
  view.addEventListener("input", e => {
    if (e.target.id === "letterText") {
      state.letter = e.target.value;
      $("#letterHint").textContent = state.letter !== state.letterAuto ? "Handmatig bewerkt — wijzigingen in de invoer worden pas verwerkt na ‘Brief opnieuw opbouwen’." : "";
      return;
    }
    if (e.target.dataset.k) onFieldInput(e.target);
  });
  view.addEventListener("change", e => { if (e.target.tagName === "SELECT" && e.target.dataset.k) onFieldInput(e.target); });
  view.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip) {
      const k = chip.dataset.k, o = chip.dataset.o, cur = new Set(state.data[k] || []);
      cur.has(o) ? cur.delete(o) : cur.add(o);
      state.data[k] = FIELD[k].options.filter(x => cur.has(x));
      chip.classList.toggle("on"); chip.setAttribute("aria-pressed", cur.has(o));
      state.dirty = true; refresh(); return;
    }
    const id = e.target.id;
    if (id === "btnCopy") copyLetter();
    else if (id === "btnDocx") download(letterDocx(state.letter, HEADINGS), visitFilename("docx"));
    else if (id === "btnXlsx") { download(visitXlsx(), visitFilename("xlsx")); state.dirty = false; toast("Excel-rij opgeslagen"); }
    else if (id === "btnRegen") { state.letter = buildLetter(state.data, state.D); state.letterAuto = state.letter; render(); }
  });
  view.addEventListener("change", e => { if (e.target.id === "mergeFiles" && e.target.files.length) mergeFiles([...e.target.files]); });
  window.addEventListener("beforeunload", e => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
  refresh(); render();
});
