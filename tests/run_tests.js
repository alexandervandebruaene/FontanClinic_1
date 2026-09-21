/* Test suite — run with:  node tests/run_tests.js   (Node >= 18, no dependencies)
   Uses only the fictional reports in tests/fixtures. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const ctx = { console, TextEncoder, TextDecoder, Blob, Response, DecompressionStream, DataView, Uint8Array, Uint32Array, ArrayBuffer };
vm.createContext(ctx);
for (const f of ["core.js", "reports.js", "office.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", f), "utf8").replace(/if \(typeof module[^\n]*\n?$/, ""), ctx, { filename: f });
const G = name => vm.runInContext(name, ctx);
const fx = f => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log("  ✓ " + name); })
    .catch(e => { fail++; console.log("  ✗ " + name + "\n      " + e.message); });
}
const eq = (a, b, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const near = (a, b, tol, m = "") => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${m} expected ${b} ± ${tol}, got ${a}`); };
const has = (s, sub) => { if (!s.includes(sub)) throw new Error(`missing: “${sub}”`); };

const parseReport = G("parseReport"), parseAny = G("parseAny"), splitSources = G("splitSources"), mergeParsed = G("mergeParsed"),
  compute = G("compute"), buildLetter = G("buildLetter"), gradeFrom = G("gradeFrom"), polarity = G("polarity");

function fullVisit() {
  const st = { data: { age: 30, ead: "000000", visit_date: "2026-03-10" }, src: {}, pstatus: {}, conflicts: {}, ref: {} };
  const parts = Object.assign({ cpet: fx("cpet_synthetic.txt") }, splitSources(fx("kws_synthetic.txt")));
  for (const [s, txt] of Object.entries(parts)) { const r = parseAny(s, txt); mergeParsed(st, r, s); if (r.ref) Object.assign(st.ref, r.ref); }
  st.data._ref = st.ref; st.data._conflicts = st.conflicts;
  const R = compute(st.data);
  return { st, d: st.data, D: R.D, flags: R.flags, letter: buildLetter(st.data, R.D) };
}

(async () => {
  console.log("helpers");
  await t("regurgitation grades", () => {
    eq(gradeFrom("AI 2/4 / stenose: geen stenose"), "matig"); eq(gradeFrom("geen MI / stenose: geen stenose"), "geen");
    eq(gradeFrom("Lichte MI (1/4)."), "licht"); eq(gradeFrom("neo AI 2+/4"), "matig"); eq(gradeFrom("Matige PI (2 a 3/4)"), "matig");
  });
  await t("negation handling", () => {
    eq(polarity("Geen dyspnoe, geen oedemen.", /dyspn/i), "neg");
    eq(polarity("Geen palpitaties maar wel dyspnoe bij inspanning.", /dyspn/i), "pos");
    eq(polarity("Uw patiënte meldt sinds 3 maanden palpitaties bij inspanning, zonder syncope.", /palpitat/i), "pos");
  });

  console.log("CPETechoPVP parser");
  const cp = parseReport(fx("cpet_synthetic.txt"));
  await t("PVP read from 'Fontan' row; stages", () => { eq(cp.values.pvp_rest, 11); eq(cp.values.pvp_low, 16); eq(cp.values.pvp_peak, 21.5); });
  await t("two-value rows = rest + peak, not flagged", () => { eq(cp.values.mv_e_rest, 80); eq(cp.values.mv_e_peak, 95); eq(cp.status.mv_e_rest, "parsed"); });
  await t("pulmonary table pairs", () => { eq(cp.values.fev1, 2.8); eq(cp.values.ve_mvv, 0.55); eq(cp.values.ve_vco2_slope, 33.1); });
  await t("CPET weight kept separate", () => { eq(cp.values.weight_cpet, 62); eq(cp.values.weight_kg, undefined); });
  await t("decimal commas", () => { const r = parseReport(fx("cpet_synthetic.txt").replace("| Fontan (mmHg) | 11.0 16.0 21.5", "| RAP (mmHg) | 11,0 16,0 21,5")); eq(r.values.pvp_peak, 21.5); });

  console.log("source splitting");
  await t("combined KWS export split into consult / liver / lab", () => eq(Object.keys(splitSources(fx("kws_synthetic.txt"))).sort(), ["consult", "lab", "liver"]));

  console.log("full visit (all four sources)");
  const V = fullVisit();
  await t("consultation fields", () => {
    const d = V.d;
    eq(d.sex, "V"); eq(d.diagnosis, "een tricuspiedklepatresie"); eq(d.fontan_details, "Glenn, 18mm extracardiale TCPC"); eq(d.fenestration, "open");
    eq(d.symptoms, ["palpitaties"]); eq(d.nyha, "II"); eq(d.smoking, "niet"); eq(d.work, "deeltijds werkend"); eq(d.work_text, "leerkracht");
    eq(d.anticoag, "aspirine"); eq(d.ecg_rhythm, "sinusritme"); eq(d.ecg_rate, 70); eq(d.vent_function, "goede"); eq(d.lvef, 58);
    eq(d.avv_regurg, "licht"); eq(d.echo_connections, "mooi/patent"); eq(d.weight_kg, 62); eq(d.spo2_clinic, 93); eq(d.congestion, "nee");
  });
  await t("history fragments classified", () => {
    has(V.d.diaphragm, "diafragmaparese rechts"); eq(V.d.venous_text, "trombose vena femoralis links 2005"); eq(V.d.thrombo_hx, "embolisatie naar de long 2005");
  });
  await t("lab values + reference-based interpretation", () => {
    eq(V.d.hb, 15.4); eq(V.d.platelets, 140); eq(V.d.ntprobnp, 180); eq(V.d.ntprobnp_interp, "verhoogd"); eq(V.d.afp_interp, "normaal"); eq(V.d.inr, 1.1); eq(V.d.lab_date, "10/03/2026");
  });
  await t("liver ultrasound", () => { eq(V.d.lsm_kpa, 14.5); eq(V.d.lsm_method, "VCTE/FibroScan"); eq(V.d.spleen_cm, 11); eq(V.d.us_findings, ["heterogeen parenchym"]); });
  await t("source priority: Hb lab over CPET, conflict reported", () => { eq(V.st.src.hb, "lab"); has(V.st.conflicts.hb, "labo gebruikt"); });

  console.log("derived variables");
  await t("FRIEND predicted peak VO2 (hand calculation 36.45 ml/kg/min)", () => {
    // 45.2 - 0.35*30 - 10.9*2 - 0.15*(62*2.20462) + 0.68*(168/2.54) - 0.46*2
    near(V.D.d_vo2_pred_friend, 36.453, 0.01); near(V.D.d_vo2_pct_friend, 57.61, 0.05);
  });
  await t("PVP@33% predicted VO2 (hand calculation 17.59 mmHg)", () => {
    // target VO2 = 0.33 * 36.453 * 62 = 745.8 ml/min -> between 520 (16) and 1300 (21.5)
    near(V.D.d_pvp_at_x_vo2, 745.8, 0.5); near(V.D.d_pvp_at_x, 17.59, 0.02); eq(V.D.d_pvp_at_x_high, 0);
  });
  await t("PVP-CO slope, ΔSVi, desaturation, iron", () => {
    near(V.D.d_pvp_co_slope, 3.0, 1e-9); eq(V.D.d_desaturation, 1); eq(V.D.d_iron_deficiency, 1); near(V.D.d_dsvi_pct, -11.5, 0.1);
  });
  await t("no chronotropic classification", () => { eq(V.D.d_chrono_incompetent, undefined); eq(V.flags.find(f => f.item === "Hartfrequentie").status, "info"); });

  console.log("letter");
  await t("structure and key sentences", () => {
    const L = V.letter;
    for (const h of ["Cardiovasculair.", "Pulmonaal.", "Perifeer.", "Eind-orgaan functie.", "* FALD", "Psychosociaal."]) has(L, h);
    has(L, "30-jarige patiënte"); has(L, "58% van voorspeld volgens FRIEND"); has(L, "17,6 mmHg bij 33% van de voorspelde piek-VO2 (normaal)");
    has(L, "Hartfrequentie 70/min in rust en 150/min bij piekinspanning"); has(L, "Desaturatie bij inspanning (94→87%)");
    has(L, "IJzerdeficiëntie (ferritine 40 µg/L, TSAT 15%)"); has(L, "Zij is deeltijds werkend (leerkracht)");
  });

  console.log("office files");
  await t("xlsx write → read round trip", async () => {
    const blob = G("xlsxBlob")([{ name: "visit", boldFirstRow: true, dateCols: new Set([1]), rows: [["ead", "visit_date", "x"], ["000000", "2026-03-10", 1.5]] }]);
    const rows = await G("readXlsxRows")(await blob.arrayBuffer());
    eq(rows[0], ["ead", "visit_date", "x"]); eq(rows[1][0], "000000"); eq(G("serialToIso")(rows[1][1]), "2026-03-10"); eq(rows[1][2], 1.5);
  });
  await t("docx is a valid zip with document.xml", async () => {
    const buf = new Uint8Array(await G("letterDocx")(V.letter, G("HEADINGS")).arrayBuffer());
    eq([buf[0], buf[1]], [0x50, 0x4b]); if (!Buffer.from(buf).toString("latin1").includes("word/document.xml")) throw new Error("no document.xml");
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
