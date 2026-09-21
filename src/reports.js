/* ======================================================================
   Parsers for the KWS consultation report, lab results and liver ultrasound,
   source splitting, merging with source priority, and duplicate checks.
   ====================================================================== */
const SRC_NAME = { cpet: "CPETechoPVP", consult: "raadpleging", lab: "labo", liver: "echo lever", prev: "vorig bezoek", manual: "handmatig" };

function _mk() {
  const values = {}, status = {}, notes = [];
  const put = (k, v, st = "parsed") => {
    if (v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) return;
    if (Array.isArray(v) && !v.length && k !== "symptoms") return;
    values[k] = v; status[k] = st;
  };
  return { values, status, notes, put };
}
const _num = s => { const m = String(s).match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : null; };

/* ---------------------------------------------------------------- KWS sections */
function kwsSections(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n"), sec = { _pre: [] };
  let cur = "_pre";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^-{3,}\s*$/.test(l)) continue;
    if (l && i + 1 < lines.length && /^-{3,}\s*$/.test(lines[i + 1].trim()) && /^[A-ZÀ-Ü0-9 \-\/&'.]+:?$/.test(l)) { cur = l.replace(/:$/, ""); sec[cur] = []; continue; }
    sec[cur].push(lines[i]);
  }
  return Object.fromEntries(Object.entries(sec).map(([k, v]) => [k, v.join("\n").trim()]));
}
function secGet(S, re) { for (const [k, v] of Object.entries(S)) if (re.test(k)) return v; return ""; }

/* echo sub-sections: lines that start with a CAPS word (MITRALISKLEP ..., BESLUIT:) */
function echoSubs(echo) {
  const out = {}; let cur = "_pre"; out[cur] = [];
  for (const line of echo.split("\n")) {
    const m = line.match(/^\s*([A-ZÀ-Ü][A-ZÀ-Ü\-\/ ]{3,}?)(?::|\s(?=[A-Za-zÀ-ü(])|$)(.*)$/);
    if (m && m[1] === m[1].toUpperCase() && /[A-Z]{4,}/.test(m[1])) { cur = m[1].trim(); out[cur] = out[cur] || []; if (m[2].trim()) out[cur].push(m[2]); continue; }
    out[cur].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join(" ").replace(/\s+/g, " ").trim()]));
}

/* ---------------------------------------------------------------- consultation report */
const PRIMARY_DX = [
  [/tricuspi\w*\s*(?:klep\s*)?atresie|\bTA\b/i, "een tricuspiedklepatresie"],
  [/hypoplastisch\w*\s+linker\s*hart|\bHLHS\b/i, "een hypoplastisch linkerhartsyndroom"],
  [/double[- ]inlet|\bDILV\b/i, "een double inlet linker ventrikel"],
  [/pulmona\w*\s*atresie met intact/i, "een pulmonalisatresie met intact ventrikelseptum"],
  [/\bDORV\b|double[- ]outlet/i, "een double outlet rechter ventrikel"],
  [/(?:ongebalanceerd|unbalanced)\w*\s*AVSD/i, "een ongebalanceerd AVSD"],
  [/mitra\w*\s*atresie/i, "een mitralisatresie"],
  [/heterota|isomer/i, "een heterotaxie"],
];
const SYMPTOM_RE = {
  dyspnoe: /dyspn|kortademig|ademnood/i, duizeligheid: /duizel|vertigo/i, hoofdpijn: /hoofdpijn|migraine/i,
  palpitaties: /palpitat|hartkloppingen|overslagen/i, syncope: /(?:pre)?syncop|flauwgevallen|bewustzijnsverlies/i,
  "thoracale pijn": /thoracale pijn|pijn op de borst|angor|borstpijn/i, oedeem: /oedeem|oedemen|gezwollen (?:benen|enkels)/i,
  vermoeidheid: /vermoeid|moeheid/i,
};

function parseConsult(text) {
  const { values, status, notes, put } = _mk();
  const S = kwsSections(text);
  const dx = secGet(S, /DIAGNOSE|ANTECEDENT/), meds = secGet(S, /BEHANDELING|MEDICATIE/),
    anam = secGet(S, /REDEN|ANAMNESE|CONSULTATIE/), ko = secGet(S, /KLINISCH/),
    ecg = secGet(S, /CARDIOGRAM|^ECG/), echo = secGet(S, /ECHOCARDIO/);
  if (!dx && !meds && !anam && !ko && !ecg && !echo) { notes.push("Geen KWS-rubrieken herkend (DIAGNOSE, HUIDIGE BEHANDELING, REDEN VAN CONSULTATIE, KLINISCH ONDERZOEK, ELECTROCARDIOGRAM, ECHOCARDIOGRAFIE)."); return { values, status, notes }; }

  // ---- diagnoses: A/ cardiac, B/ non-cardiac, C/ interventions
  const blocks = { cardiac: [], noncardiac: [], interventions: [] };
  let kind = "cardiac";
  for (const line of dx.split("\n")) {
    const m = line.match(/^\s*[A-D]\/\s*(.*)$/);
    if (m) {
      const t = m[1].toLowerCase();
      kind = /interventie|operatie|ingreep/.test(t) ? "interventions" : /niet-cardi|antecedent/.test(t) ? "noncardiac" : "cardiac";
      if (m[1].trim() && !/:\s*$/.test(m[1])) blocks[kind].push(m[1]);
      continue;
    }
    if (line.trim()) blocks[kind].push(line.trim());
  }
  const cardiac = blocks.cardiac.join("\n"), nonc = blocks.noncardiac.join("\n"), iv = blocks.interventions.join("\n");

  const prim = PRIMARY_DX.find(([re]) => re.test(cardiac || dx));
  if (prim) {
    let dxs = prim[1];
    if (/congenitaal gecorrigeerde|\bccTGA\b|L-?TGA/i.test(cardiac)) dxs += " met congenitaal gecorrigeerde transpositie van de grote arteries";
    else if (/transpositie|\bTGA\b/i.test(cardiac)) dxs += " met transpositie van de grote arteries";
    put("diagnosis", dxs, "ambiguous");
  }
  // Fontan details
  const stagesF = [];
  if (/Damus|\bDKS\b/i.test(iv)) stagesF.push("DKS");
  if (/Norwood/i.test(iv)) stagesF.push("Norwood");
  if (/hemi-?Fontan/i.test(iv)) stagesF.push("hemi-Fontan"); else if (/Glenn|\bBCPC\b|\bBDG\b/i.test(iv)) stagesF.push("Glenn");
  const fl = iv.split("\n").find(l => /TCPC|\bFontan\b/i.test(l) && !/hemi-?Fontan/i.test(l));
  if (fl) {
    const mm = fl.match(/(\d+)\s*mm/);
    const type = /extracardia/i.test(fl) ? "extracardiale TCPC" : /lateral|intra-?atria|tunnel/i.test(fl) ? "laterale tunnel TCPC" : /atriopulm/i.test(fl) ? "atriopulmonale Fontan" : "TCPC";
    stagesF.push((mm ? mm[1] + "mm " : "") + type);
  }
  if (stagesF.length) put("fontan_details", stagesF.join(", "), "ambiguous");
  if (/fenestr/i.test(iv)) put("fenestration", /(sluit|sluiting|gesloten|afgesloten|occlu|amplatz)[^\n]*fenestr|fenestr[^\n]*(gesloten|dicht|occlu)/i.test(iv) ? "gesloten" : "open", "ambiguous");

  // non-cardiac history: classify fragments
  const diaphragm = [], venous = [], thrombo = [], arr = [], collat = [];
  for (let frag of nonc.split(/;|\n/)) {
    frag = frag.trim().replace(/^PO\s+/, "postoperatieve "); if (!frag) continue;
    if (/diafragma/i.test(frag)) { diaphragm.push(frag); continue; }
    for (const piece of frag.split(/,\s*/)) {
      if (/\bvena\b|\bvenae\b|\bVCI\b|\bVCS\b|femora|iliaca|trombo(?:se|flebitis)|\bDVT\b/i.test(piece)) venous.push(piece.trim());
      else if (/embol|\bCVA\b|infarct|\bTIA\b/i.test(piece)) thrombo.push(piece.trim());
    }
  }
  for (const frag of (nonc + "\n" + iv + "\n" + cardiac).split(/;|\n/))
    if (/flutter|fibrillatie|\bIART\b|tachycard|pacemaker|ablatie|\bICD\b|sinusknoop|AV-?blok/i.test(frag) && polarity(frag, /flutter|fibrillatie|IART|tachycard|pacemaker|ablatie|ICD|sinusknoop|AV-?blok/i) === "pos") arr.push(frag.trim());
  for (const frag of iv.split(/\n/)) if (/collateral/i.test(frag)) collat.push(frag.trim());
  if (diaphragm.length) put("diaphragm", diaphragm.join("; "), "ambiguous");
  if (venous.length) put("venous_text", venous.join("; "), "ambiguous");
  if (thrombo.length) put("thrombo_hx", thrombo.join("; "), "ambiguous");
  if (arr.length) put("arrhythmia_hx", arr.join("; "), "ambiguous");
  if (collat.length) put("collat_free", collat.join("; "), "ambiguous");
  if (polarity(dx, /\bPLE\b|eiwitverliez/i) === "pos") put("ple", "bevestigd", "ambiguous");
  if (polarity(dx, /plastische bronchitis/i) === "pos") put("plastic_bronchitis", "bevestigd", "ambiguous");

  // ---- medication
  const medLines = meds.split("\n").map(s => s.trim()).filter(Boolean);
  if (medLines.length) {
    put("meds_text", medLines.join("; "));
    const ml = meds.toLowerCase();
    const ac = /marcoumar|sintrom|warfarin|acenocoumarol|fenprocoumon|phenprocoumon/.test(ml) ? "VKA"
      : /apixaban|eliquis|rivaroxaban|xarelto|edoxaban|lixiana|dabigatran|pradaxa/.test(ml) ? "DOAC"
      : /clexane|fraxiparin|enoxaparin|tinzaparin|innohep|fragmin|dalteparin|nadroparin/.test(ml) ? "LMWH"
      : /\basa\b|aspirin|asaflow|cardioaspirin|acetylsalicyl/.test(ml) ? "aspirine" : "geen";
    put("anticoag", ac, ac === "geen" ? "ambiguous" : "parsed");
    if (/ferro|ijzer|ferinject|tardyferon|ferrograd|venofer|ferricarboxymaltose/.test(ml)) put("iron_supp", "ja");
  }

  // ---- sex suggestion from pronouns / 'patiënte'
  const all = [anam, ko, dx].join(" ");
  const nm = (all.match(/\bhij\b/gi) || []).length + (/\bpatiënt\b/i.test(all) ? 1 : 0);
  const nf = (all.match(/\bzij\b|\bhaar\b/gi) || []).length + (/\bpatiënte\b/i.test(all) ? 3 : 0);
  if (nm !== nf && (nm >= 2 || nf >= 2)) put("sex", nm > nf ? "M" : "V", "ambiguous");

  // ---- anamnesis
  if (anam) {
    const present = Object.keys(SYMPTOM_RE).filter(k => polarity(anam, SYMPTOM_RE[k]) === "pos");
    put("symptoms", present, present.length ? "ambiguous" : "parsed");
    const ny = anam.match(/NYHA\s*(?:klasse|class)?\s*(IV|I{1,3}|[1-4])\b/i);
    if (ny) put("nyha", { 1: "I", 2: "II", 3: "III", 4: "IV" }[ny[1]] || ny[1].toUpperCase());
    if (/gewichtsverlies|afgevallen|vermagerd|(?:gewicht|kg)[^.]*?(?:verlo|verminder|gedaald|daling)|(?:verlo|verminder)[^.]*?(?:gewicht|kg)/i.test(anam)) put("weight_trend", "gewichtsverlies", "ambiguous");
    else if (/gewichtstoename|bijgekomen|(?:gewicht|kg)[^.]*?toegenomen/i.test(anam)) put("weight_trend", "gewichtstoename", "ambiguous");
    const sp = anam.match(/sport\s*:\s*([^\n]+)/i);
    if (sp) put("activity", /\b(geen|niet|nee)\b/i.test(sp[1]) ? "sedentair" : "regelmatig sportend", "ambiguous");
    else if (polarity(anam, /fitness|sport|fiets|zwem|jog|loopt|wandel/i) === "pos") put("activity", "recreatief actief", "ambiguous");
    const rk = anam.match(/roken\s*:\s*([^\n]+)/i);
    if (rk) put("smoking", /\bex\b|gestopt|vroeger|voormalig/i.test(rk[1]) ? "ex-roker" : /\b(niet|nee|nooit|geen)\b/i.test(rk[1]) ? "niet" : "actief");
    else if (/niet-?roker|rookt niet/i.test(anam)) put("smoking", "niet");
    else if (/ex-?roker/i.test(anam)) put("smoking", "ex-roker");
    // work
    const w = /(?:stopte|gestopt) met werken|werkloos|werkzoekend|op zoek naar (?:een )?(?:andere |nieuwe )?(?:werkgever|werk|job|baan)/i.test(anam) ? "werkzoekend"
      : /arbeidsongeschikt|invaliditeit|ziekteverlof|ziekte-?uitkering|langdurig ziek/i.test(anam) ? "arbeidsongeschikt"
      : /\bstudeert\b|\bstudent\b/i.test(anam) ? "student" : /gepensioneerd|met pensioen/i.test(anam) ? "gepensioneerd"
      : /deeltijds|halftijds|4\/5|parttime/i.test(anam) ? "deeltijds werkend" : /voltijds|fulltime/i.test(anam) ? "voltijds werkend" : null;
    if (w) put("work", w, "ambiguous");
    const wt = anam.match(/werkte als ([^).,;\n]+)/i), wt2 = anam.match(/werk(?:t|zaam)(?:\s+(?!als\b)\w+){0,2}\s+als ([^).,;\n]+)/i);
    if (wt) put("work_text", "voorheen " + wt[1].trim(), "ambiguous"); else if (wt2) put("work_text", wt2[1].trim(), "ambiguous");
    if (polarity(anam, /psycholo\w*|psychiat\w*|psychotherap\w*|therapeut/i) === "pos")
      put("psych_wellbeing", /gepland|voorzien|verwe(?:zen|zing)|aangemeld|wachtlijst/i.test(anam) ? "begeleiding voorzien" : "begeleiding lopend", "ambiguous");
    else if (polarity(anam, /stress|angst|depress|somber|burn-?out/i) === "pos") put("psych_wellbeing", "moeilijkheden, geen begeleiding", "ambiguous");
  }

  // ---- clinical exam
  if (ko) {
    const h = ko.match(/lengte\s*:?\s*(\d+(?:[.,]\d+)?)/i); if (h) put("height_cm", _num(h[1]));
    const g = ko.match(/gewicht\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:\(([^)]*)\))?/i);
    if (g) { put("weight_kg", _num(g[1])); if (g[2]) put("weight_prev", g[2].trim()); }
    const sa = ko.match(/\bsat\w*\s*:?\s*(\d+(?:[.,]\d+)?)/i); if (sa) put("spo2_clinic", _num(sa[1]));
    const p = ko.match(/(?:pols|hartfrequentie|\bHF\b)\s*:?\s*(\d{2,3})/i); if (p) put("hr_clinic", +p[1]);
    const bp = ko.match(/(?:\bBD\b|bloeddruk)[^\d\n]*(\d{2,3})\s*\/\s*(\d{2,3})/i); if (bp) { put("sbp_clinic", +bp[1]); put("dbp_clinic", +bp[2]); }
    const cong = [polarity(ko, /oedeem|oedemen/i), polarity(ko, /hepatomegalie|(?:hepar|lever) (?:is )?vergroot/i), polarity(ko, /ascites/i),
      polarity(ko, /halsvene\w* (?:gestuwd|verhoogd|gevuld)|stuwing/i)];
    if (cong.includes("pos")) put("congestion", "ja", "ambiguous");
    else if (cong.includes("neg") || /hepar niet vergroot/i.test(ko)) put("congestion", "nee");
  }

  // ---- ECG
  if (ecg) {
    const r = /flutter|\bIART\b|macro-?reentry/i.test(ecg) ? "atriale flutter/IART" : /\bVKF\b|\bAF\b|voorkamerfibrillatie|atriumfibrillatie/i.test(ecg) ? "voorkamerfibrillatie"
      : /pacing|pacemaker|\bDDD\b|\bVVI\b|\bAAI\b/i.test(ecg) ? (/atria|\bAAI\b/i.test(ecg) ? "atriale pacing" : "ventriculaire pacing")
      : /junction|nodaal/i.test(ecg) ? "junctioneel ritme" : /\bSR\b|sinus/i.test(ecg) ? "sinusritme" : null;
    if (r) put("ecg_rhythm", r);
    const rate = ecg.match(/(\d{2,3})\s*\/\s*min/); if (rate) put("ecg_rate", +rate[1]);
    const clauses = ecg.replace(/\.\s*$/, "").split(/,\s*/).map(s => s.trim()).filter(Boolean);
    const rest = clauses.filter(c => !/^(?:SR|sinusritme|sinus|junctioneel|nodaal|VKF|voorkamerfibrillatie|flutter|IART|pacing)\b|\d+\s*\/\s*min/i.test(c) && !/onveranderd|ongewijzigd|\bidem\b/i.test(c));
    if (rest.length) put("ecg_comment", rest.join(", "));
    if (/onveranderd|ongewijzigd|\bidem\b/i.test(ecg)) put("ecg_change", "essentieel onveranderd");
  }

  // ---- echocardiography
  if (echo) {
    const E = echoSubs(echo);
    const besluit = Object.entries(E).filter(([k]) => /BESLUIT|CONCLUSIE/.test(k)).map(([, v]) => v).join(" ");
    const vf = (besluit + " ").match(/(goede|normale|behouden|licht (?:gedaalde|verminderde)|matig (?:gedaalde|verminderde)|ernstig (?:gedaalde|verminderde)|slechte)\s+(?:\w+\s+)?(?:systolische\s+)?(?:ventrikel)?functie/i);
    const mapVF = t => /goed|normaal|normale|behouden/i.test(t) ? "goede" : /licht/i.test(t) ? "licht verminderde" : /matig/i.test(t) ? "matig verminderde" : /ernstig|slecht/i.test(t) ? "ernstig verminderde" : null;
    if (vf) put("vent_function", mapVF(vf[1]));
    else {
      const gf = echo.match(/globale (?:systolische )?functie (?:is )?(normaal|goed|licht verminderd|matig verminderd|ernstig verminderd|sterk verminderd)/i);
      if (gf) put("vent_function", mapVF(gf[1]), "ambiguous");
    }
    const ef = echo.match(/\bEF\b[^\d\n%]{0,12}(\d+(?:[.,]\d+)?)\s*%/); if (ef) put("lvef", _num(ef[1]));
    // systemic AV valve
    const hlhs = /HLHS|hypoplastisch\w*\s+linker/i.test(dx);
    const avvKey = Object.keys(E).find(k => hlhs ? /TRICUSPIDALIS/.test(k) : /MITRALIS/.test(k)) || Object.keys(E).find(k => /AV-KLEP|GEMEENSCHAPPELIJKE/.test(k));
    if (avvKey) {
      const tok = /MITRALIS/.test(avvKey) ? /\bMI\b|insuff|regurg/i : /TRICUSPIDALIS/.test(avvKey) ? /\bTI\b|insuff|regurg/i : /insuff|regurg/i;
      const sen = sentencesOf(E[avvKey]).find(s => tok.test(s));
      const gr = sen ? gradeFrom(sen) : null;
      if (gr) put("avv_regurg", gr);
      put("avv_name", /MITRALIS/.test(avvKey) ? "mitralisklep" : /TRICUSPIDALIS/.test(avvKey) ? "tricuspidalisklep" : "gemeenschappelijke AV-klep", "ambiguous");
    }
    // systemic semilunar valve — the conclusion (besluit) wins over the section text
    const neo = besluit.match(/neo[- ]?(?:aorta\w*\s*)?(?:AI|insuff\w*|regurg\w*)\s*([^.,;]*)/i);
    const aoKey = Object.keys(E).find(k => /AORTAKLEP|NEO-?AORTA/.test(k));
    const aoSen = aoKey ? sentencesOf(E[aoKey]).find(s => /\bAI\b|insuff|regurg/i.test(s)) : null;
    if (neo) {
      const g1 = gradeFrom(neo[0]); if (g1) put("slv_regurg", g1);
      put("slv_name", "neo-aortaklep", "ambiguous");
      if (aoSen && gradeFrom(aoSen) && gradeFrom(aoSen) !== g1) {
        const piKey = Object.keys(E).find(k => /PULMONALIS/.test(k));
        const piSen = piKey ? sentencesOf(E[piKey]).find(s => /\bPI\b|insuff/i.test(s)) : null;
        notes.push(`Echo: aortaklep-sectie ‘${aoSen}’ ≠ besluit ‘${neo[0].trim()}’ → besluit gebruikt` + (piSen ? ` (pulmonalisklep-sectie: ‘${piSen}’ — neo-aorta na DKS?)` : "") + ". Controleren.");
      }
    } else if (aoSen) {
      const g2 = gradeFrom(aoSen); if (g2) put("slv_regurg", g2);
      put("slv_name", "aortaklep", "ambiguous");
    }
    if (/patente? connecties|connecties (?:zijn )?(?:patent|vrij)|vrije (?:fontan)?\s*connecties/i.test(echo)) put("echo_connections", "mooi/patent");
    else if (/stenose (?:van|ter hoogte van) (?:de )?(?:conduit|TCPC|Glenn|connectie|LPA|RPA)/i.test(echo)) put("echo_connections", "stenose", "ambiguous");
  }
  return { values, status, notes };
}

/* ---------------------------------------------------------------- lab */
const LAB_MAP = [
  [/^h(?:ae|a|e)moglobine\b/i, "hb"], [/^(?:bloedplaatjes(?: telling)?|trombocyten|thrombocyten)\b/i, "platelets"],
  [/^lymfocyten (?:aantal|absoluut)\b/i, "lymphocytes"], [/^creatinine\b/i, "creatinine"], [/^egfr\b/i, "egfr"],
  [/^(?:micro-?)?albumine\s*\/\s*creatinine|^albumine-?creatinine|^ACR\b/i, "acr"], [/^albumine\b(?!\s*\/)/i, "albumin"],
  [/^(?:AST|ASAT|GOT)\b/i, "ast"], [/^(?:ALT|ALAT|GPT)\b/i, "alt"], [/^(?:gamma[ -]?GT|GGT)\b/i, "ggt"],
  [/^(?:bilirubine totaal|totaal bilirubine|bilirubine)\b/i, "bilirubin"], [/^NT-?pro-?BNP\b/i, "ntprobnp"],
  [/^ferritine\b/i, "ferritin"], [/^(?:transferrine ?saturatie|TSAT)\b/i, "tsat"], [/^(?:alfa-?fetoprote(?:i|ï)ne|AFP)\b/i, "afp"],
  [/^alfa-?1-?antitrypsine.*(?:faec|feces|stoelgang)/i, "a1at_stool"],
];
function parseLab(text) {
  const { values, status, notes, put } = _mk();
  const ref = {}, abnormal = [];
  const raw = String(text || "").replace(/\r/g, "").split("\n").map(s => s.trim());
  const lines = [];
  for (let i = 0; i < raw.length; i++) {           // re-join wrapped analyte names
    const l = raw[i]; if (!l) continue;
    if (!/\d/.test(l) && i + 1 < raw.length && /^\*?\s*[<>]?\d/.test(raw[i + 1])) { lines.push(l + " " + raw[i + 1]); i++; } else lines.push(l);
  }
  let urine = false;
  const dt = String(text).match(/(\d{2})-(\d{2})-(\d{4})\s+\d{1,2}:\d{2}/);
  if (dt) put("lab_date", `${dt[1]}/${dt[2]}/${dt[3]}`);
  for (const l of lines) {
    if (/^->/.test(l)) continue;
    if (/\burine\b/i.test(l) && !/\d/.test(l)) { urine = true; continue; }
    if (/-\s*bloed\b|^(?:chemie|hematologie|stolling|tumormerkers|endocrinologie)/i.test(l)) urine = false;
    const star = /\s\*\s/.test(" " + l + " ");
    const mInr = l.match(/^protrombinetijd.*?(\d+(?:[.,]\d+)?)\s*INR\b/i) || l.match(/^INR\b\s*\*?\s*(\d+(?:[.,]\d+)?)/i);
    if (mInr) { put("inr", _num(mInr[1])); if (star) abnormal.push({ name: "INR", value: _num(mInr[1]), unit: "", range: "" }); continue; }
    const hit = LAB_MAP.find(([re]) => re.test(l));
    const nm = l.match(/^([^\d*<>]+?)\s*(?:\*\s*)?(?=[<>]?\d)/);
    const after = nm ? l.slice(nm[0].length) : "";
    const vm = after.match(/^[<>]?\s*(\d+(?:[.,]\d+)?)\s*(10\^?\d+\/L|[^\s\d<>=≤≥][^\s]*)?\s*(.*)$/);
    if (!vm) continue;
    const value = _num(vm[1]), unit = vm[2] || "", tail = vm[3] || "";
    const r1 = tail.match(/(<=|<|>=|>|≤|≥)\s*(\d+(?:[.,]\d+)?)/), r2 = tail.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
    let lo = null, hi = null;
    if (r2) { lo = _num(r2[1]); hi = _num(r2[2]); } else if (r1) { if (/</.test(r1[1]) || r1[1] === "≤") hi = _num(r1[2]); else lo = _num(r1[2]); }
    if (star) abnormal.push({ name: nm[1].trim(), value, unit, range: r2 ? `${r2[1]} - ${r2[2]}` : r1 ? `${r1[1]} ${r1[2]}` : "" });
    if (!hit) continue;
    let key = hit[1];
    if (urine && (key === "creatinine" || key === "albumin")) continue;
    if (key === "lymphocytes" && /%/.test(unit)) continue;
    let v = value;
    if (key === "acr" && /mmol/i.test(unit)) v = +(value * 8.84).toFixed(1);
    if (key === "albumin" && /g\/dl/i.test(unit)) v = value * 10;
    if (values[key] !== undefined) continue;          // first occurrence wins
    put(key, v); ref[key] = [lo, hi];
  }
  if (values.ntprobnp !== undefined && ref.ntprobnp && ref.ntprobnp[1] !== null) put("ntprobnp_interp", values.ntprobnp > ref.ntprobnp[1] ? "verhoogd" : "normaal");
  if (values.afp !== undefined && ref.afp && ref.afp[1] !== null) put("afp_interp", values.afp > ref.afp[1] ? "verhoogd" : "normaal");
  if (values.ast !== undefined && ref.ast && ref.ast[1] !== null) put("ast_uln", ref.ast[1]);
  if (!Object.keys(values).length) notes.push("Geen labowaarden herkend.");
  return { values, status, notes, ref, abnormal };
}

/* ---------------------------------------------------------------- liver ultrasound */
function parseLiverUS(text) {
  const { values, status, notes, put } = _mk();
  const t = String(text || "").replace(/\r/g, "");
  const line = re => (t.match(re) || [, ""])[1];
  const cm = t.match(/CONCLUSIE\s*:?\s*([\s\S]*)$/i);
  const concl = cm ? cm[1].split("\n").map(s => s.trim()).filter(s => s && !/^in vergelijking met/i.test(s)).join(" ") : "";
  const F = [];
  if (/nodulair|onregelmatig|hobbelig/i.test(line(/contour\w*\s*:?\s*([^\n]*)/i)) && !/niet nodulair/i.test(t)) F.push("nodulaire contour");
  if (/heterogeen|inhomogeen|grof/i.test(line(/parenchym\w*\s*:?\s*([^\n]*)/i))) F.push("heterogeen parenchym");
  if (polarity(t, /hepatomegalie|vergrote lever|lever (?:is )?vergroot/i) === "pos" || /vergroot|toegenomen/i.test(line(/volume\s*:?\s*([^\n]*)/i))) F.push("hepatomegalie");
  const lesLine = line(/letsels?\s*:?\s*([^\n]*)/i);
  if ((lesLine && polarity(lesLine, /letsel|nodul(?:e|us|i)\b|HCC|haard/i) === "pos") || polarity(concl, /(?:focale?|HCC)\b[^.]*letsel|\bHCC\b|haard/i) === "pos") F.push("focaal letsel");
  if (polarity(t, /splenomegal|vergrote milt|milt (?:is )?vergroot/i) === "pos") F.push("splenomegalie");
  if (polarity(t, /ascites/i) === "pos") F.push("ascites");
  const shunt = polarity(t, /\bSPSS\b|portosystemische|spontane shunt|varices|collateralen/i) === "pos";
  if (shunt) F.push("portosystemische collateralen/shunt");
  if (/hepatofug/i.test(line(/(?:V\.?|vena)\s*porta\w*\s*:?\s*([^\n]*)/i))) F.push("hepatofugale portale flow");
  if (polarity(concl, /portale hypertensie\w*/i) === "pos" || F.includes("ascites") || shunt || F.includes("hepatofugale portale flow")) F.push("portale hypertensietekenen");
  const order = FIELD.us_findings.options;
  put("us_findings", F.length ? order.filter(o => F.includes(o)) : ["geen afwijkingen"]);
  const sp = t.match(/milt[^.\n]*?(\d+(?:[.,]\d+)?)\s*cm/i); if (sp) put("spleen_cm", _num(sp[1]));
  if (concl) put("us_conclusion", concl);
  const prev = t.match(/voorgaande? onderzoek van (\d{2}[-\/.]\d{2}[-\/.]\d{4})/i); if (prev) put("us_prev_date", prev[1].replace(/[-.]/g, "/"));
  const ud = t.match(/(?:datum(?: onderzoek)?|onderzoeksdatum|uitgevoerd op)\s*:?\s*(\d{2}[-\/.]\d{2}[-\/.]\d{4})/i);
  if (ud) put("us_date", ud[1].replace(/[-.]/g, "/")); else notes.push("Echo lever: onderzoeksdatum niet in het verslag — invullen bij Lever (FALD).");
  const k = t.match(/(\d+(?:[.,]\d+)?)\s*kPa/i);
  if (k) {
    put("lsm_kpa", _num(k[1]));
    const meth = /fibroscan|VCTE|transi[eë]nt/i.test(t) ? "VCTE/FibroScan" : /pSWE|point shear|ARFI/i.test(t) ? "pSWE" : /2D-?SWE|shear ?wave/i.test(t) ? "2D-SWE" : null;
    if (meth) put("lsm_method", meth); else notes.push("Leverstijfheid gevonden, methode niet vermeld — invullen.");
  } else if (/\d+(?:[.,]\d+)?\s*m\/s/i.test(t) && /elasto|stijfheid|shear/i.test(t)) notes.push("Leverstijfheid enkel in m/s gevonden — kPa manueel invullen.");
  return { values, status, notes };
}

/* ---------------------------------------------------------------- source detection & splitting */
const SRC_MARKERS = {
  consult: /^(?:DIAGNOSE\s*-\s*ANTECEDENTEN|HUIDIGE BEHANDELING|REDEN VAN CONSULTATIE|KLINISCH ONDERZOEK)\s*$/m,
  cpet: /^(?:Inspanningsecho|CPET:)\s*$/m,
  liver: /^(?:RELEVANTE KLINISCHE INLICHTINGEN|DIAGNOSTISCHE VRAAGSTELLING:?)\s*$|^Echografie van de lever/m,
  lab: /^(?:Hematologie|Chemie Bloed|Chemie Schildklierfunctie|Stolling|Tumormerkers|Biochemie bloed)\s*$/m,
};
function splitSources(text) {
  const starts = [];
  for (const [src, re] of Object.entries(SRC_MARKERS)) { const m = text.match(re); if (m) starts.push([m.index, src]); }
  if (!starts.length) return null;
  starts.sort((a, b) => a[0] - b[0]);
  const out = {};
  starts.forEach(([pos, src], i) => {
    const from = i === 0 ? 0 : pos, to = i + 1 < starts.length ? starts[i + 1][0] : text.length;
    out[src] = (out[src] ? out[src] + "\n" : "") + text.slice(from, to);
  });
  return out;
}
function parseAny(src, text) {
  if (src === "cpet") return parseReport(text);
  if (src === "consult") return parseConsult(text);
  if (src === "lab") return parseLab(text);
  if (src === "liver") return parseLiverUS(text);
}

/* ---------------------------------------------------------------- merge with source priority */
// For fields fed by more than one source: earlier in the list wins. 'manual' and 'prev' (curated text) always win.
const PRIORITY = {
  hb: ["lab", "cpet"], meds_text: ["consult", "cpet"], height_cm: ["consult", "cpet"],
  vent_function: ["consult", "cpet"], echo_connections: ["consult", "cpet"], slv_regurg: ["consult", "cpet"],
};
function srcRank(k, src) {
  if (src === "manual") return -2;
  if (src === "prev") return -1;
  const p = PRIORITY[k]; if (!p) return 0;
  const i = p.indexOf(src); return i < 0 ? p.length : i;
}
function _same(a, b) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a || []) === JSON.stringify(b || []);
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}
function _show(v) { return Array.isArray(v) ? v.join(", ") || "—" : typeof v === "number" ? n(v, 2).replace(/,?0+$/, "").replace(/,$/, "") : String(v); }
const _empty = v => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

/* mutates data/src/pstatus/conflicts; returns number of values taken */
function mergeParsed(st, parsed, src) {
  let taken = 0;
  for (const [k, v] of Object.entries(parsed.values)) {
    const f = FIELD[k]; if (!f) continue;
    const cur = st.data[k], cs = st.src[k];
    const set = () => { st.data[k] = v; st.src[k] = src; st.pstatus[k] = parsed.status[k]; taken++; };
    if (_empty(cur) || cs === src || cs === undefined) { if (!(k === "symptoms" && !_empty(cur) && cs !== src && _empty(v))) set(); delete st.conflicts[k]; continue; }
    if (_same(cur, v)) { if (srcRank(k, src) < srcRank(k, cs)) { st.src[k] = src; st.pstatus[k] = parsed.status[k]; } delete st.conflicts[k]; continue; }
    if (cs === "prev" && parsed.status[k] === "ambiguous") continue;   // curated text from last visit beats an automatic suggestion, silently
    const win = srcRank(k, src) < srcRank(k, cs);
    const msg = `${f.label}: ${SRC_NAME[cs]} ‘${_show(cur)}’ vs ${SRC_NAME[src]} ‘${_show(v)}’ → ${win ? SRC_NAME[src] : SRC_NAME[cs]} gebruikt`;
    st.conflicts[k] = msg;
    if (win) set();
  }
  return taken;
}

/* ---------------------------------------------------------------- consistency / duplicate checks */
const LETTER_TEXT_FIELDS = ["history_extra", "diaphragm", "venous_text", "venous_free", "thrombo_hx", "arrhythmia_hx", "cv_free", "pulm_free",
  "periph_free", "liver_free", "us_conclusion", "egd_note", "lymph_imaging", "collat_free", "other_free", "psych_free", "social", "plan_free", "echo_comment", "kidney_free", "lymph_free"];
const TOPICS = [
  ["diafragma", /diafragma/i], ["veneuze obstructie/trombose", /\bvena\b|\bvenae\b|\bVCI\b|iliaca|femora|tromboflebitis/i],
  ["gewicht", /gewicht|\bkg\b/i], ["psychologische begeleiding", /psycholo/i], ["fenestratie", /fenestr/i],
  ["embolie", /embol/i], ["portale hypertensie", /portale hypertensie/i], ["gastroscopie", /gastroscop/i],
];
function consistencyChecks(d) {
  const out = [];
  const w = d.weight_kg, wc = d.weight_cpet;
  if (typeof w === "number" && typeof wc === "number" && Math.abs(w - wc) > 3)
    out.push({ item: "Gewicht", value: `raadpleging ${n(w)} kg vs CPET ${n(wc)} kg`, note: "CPET van een andere datum? VO2/kg en SVi zijn met het CPET-gewicht berekend." });
  const s1 = d.spo2_clinic, s2 = d.spo2_rest;
  if (typeof s1 === "number" && typeof s2 === "number" && Math.abs(s1 - s2) >= 3)
    out.push({ item: "Saturatie rust", value: `raadpleging ${n(s1, 0)}% vs CPET ${n(s2, 0)}%`, note: "" });
  const lbl = k => FIELD[k].label;
  for (const [name, re] of TOPICS) {
    const hits = LETTER_TEXT_FIELDS.filter(k => typeof d[k] === "string" && re.test(d[k]));
    if (name === "gewicht" && d.weight_trend) hits.push("weight_trend");
    if (hits.length > 1) out.push({ item: "Mogelijk dubbel in brief", value: `‘${name}’ in: ${hits.map(lbl).join(" · ")}`, note: "controleer of het slechts één keer in de brief moet" });
  }
  const grams = k => { const w = String(d[k] || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean); const g = new Set(); for (let i = 0; i + 4 <= w.length; i++) g.add(w.slice(i, i + 4).join(" ")); return g; };
  const G = Object.fromEntries(LETTER_TEXT_FIELDS.map(k => [k, grams(k)]));
  for (let i = 0; i < LETTER_TEXT_FIELDS.length; i++) for (let j = i + 1; j < LETTER_TEXT_FIELDS.length; j++) {
    const a = LETTER_TEXT_FIELDS[i], b = LETTER_TEXT_FIELDS[j];
    const shared = [...G[a]].find(x => G[b].has(x));
    if (shared) out.push({ item: "Dubbele tekst", value: `${lbl(a)} · ${lbl(b)}`, note: `delen ‘…${shared}…’` });
  }
  return out;
}

if (typeof module !== "undefined") module.exports = { parseConsult, parseLab, parseLiverUS, splitSources, parseAny, mergeParsed, consistencyChecks, kwsSections, echoSubs, SRC_NAME };
