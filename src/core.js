/* ======================================================================
   FontanClinic — core logic (no DOM). Config, fields, parser, derive, letter.
   ====================================================================== */

/* ---------------------------------------------------------------- CONFIG
   Items marked CONFIRM are provisional defaults awaiting confirmation. */
const CONFIG = {
  T: {
    rer_maximal: 1.05,          // RER > 1.05 = maximal test
    peak_vo2_pct_pred: 80,      // flowchart: peak VO2 < 80 % pred (for Fontan)
    ve_mvv: 0.80,
    mvv_factor: 40,
    tiffeneau_obstructive: 0.70,
    fev1_pct_low: 80,
    ve_vco2_classes: [30, 36, 45], // Arena I <30, II 30–35.9, III 36–44.9, IV ≥45
    pvp_at_x: 19.2,             // flowchart: PVP@33 > 19.2 mmHg
    pvp_co_slope: 3.0,          // flowchart: pressure–CO slope > 3
    dsvi_pct: -10,              // ΔSVi ≤ −10 %
    dspo2: 5,                   // fall in SpO2 rest -> peak (%-points)
    dco_dvo2: 7,
    cavo2_peak: 14,
    svo2_implausible: 20,
    cavo2_fraction_of_cao2: 0.90,
    ferritin_low: 100, ferritin_mid: 300, tsat_low: 20,
    egfr_categories: [90, 60, 30],
    acr_a2: 30, acr_a3: 300,
    platelets_low: 150,
  },
  // Predicted peak VO2: FRIEND (de Souza e Silva et al., Eur J Prev Cardiol 2018;25:742-750):
  // VO2max (ml/kg/min) = 45.2 - 0.35*age - 10.9*sex(M=1,F=2) - 0.15*weight(lb) + 0.68*height(in) - 0.46*mode(treadmill=1, bike=2)
  VO2_PRED_REFERENCE: "friend",
  EXERCISE_MODE: 2,                                        // cycle ergometer
  // PVP interpolated at a VO2 equal to 33 % of the FRIEND-predicted peak VO2 (absolute, ml/min)
  PVP_AT: { axis: "pct_pred_vo2", value: 33, confirmed: true },
  TWO_VALUE_STAGES: ["rest", "peak"],                      // rows with 2 values = rest + peak (confirmed)
  PVP_SLOPE_METHOD: "two_point",                           // two_point | regression
  FONLIVER_TABLE: null,                                    // manual score entry
  DECIMAL_COMMA: true,
};

function settingsSummary() {
  const c = CONFIG, T = c.T;
  return [
    "Voorspelde piek-VO2: FRIEND (de Souza e Silva 2018), fietsergometer; gewicht bij CPET, lengte",
    `PVP@${c.PVP_AT.value}: Fontandruk geïnterpoleerd bij VO2 = ${c.PVP_AT.value}% van de FRIEND-voorspelde piek-VO2 (drempel > ${T.pvp_at_x} mmHg)`,
    `PVP-CO slope: rust → piek (drempel > ${T.pvp_co_slope} mmHg/L/min)`,
    "Rijen met 2 waarden in de inspanningsecho → rust + piek",
    "Hartfrequentie: enkel rust en piek gerapporteerd (geen chronotrope beoordeling)",
    `Desaturatie: daling SpO2 ≥ ${T.dspo2} %-punt`,
    `ΔSVi preload-limitatie: ≤ ${T.dsvi_pct}%`,
    "FonLiver: manuele invoer",
  ];
}

/* ---------------------------------------------------------------- FIELDS */
const DOMAINS = [
  ["header", "Bezoek"], ["cv", "Cardiovasculair"], ["pulm", "Pulmonaal"], ["periph", "Perifeer"],
  ["liver", "Lever (FALD)"], ["kidney", "Nier"], ["lymph", "Lymfatisch"], ["collat", "Collateralen"],
  ["venous", "Veneus"], ["other", "Overige eindorganen"], ["psych", "Psychosociaal"], ["plan", "Beleid"],
];
const DOMAIN_LABEL = Object.fromEntries(DOMAINS);
const FLAG_DOMAIN_LABEL = Object.assign({}, DOMAIN_LABEL, { src: "Bronnen & dubbels" });
const ENDORGAN = ["liver", "kidney", "lymph", "collat", "venous", "other"];
const YN = ["", "nee", "ja"];
const GRADE = ["", "geen", "licht", "matig", "ernstig"];

const FIELDS = [];
function add(key, label, domain, kind = "num", o = {}) {
  FIELDS.push({ key, label, domain, kind, unit: o.unit || "", dec: o.dec ?? 1, options: o.options || null,
    cf: !!o.cf, source: o.source || "manual", group: o.group || "", help: o.help || "" });
}
function stages(prefix, label, domain, unit, dec, group, which = ["rest", "low", "peak"], source = "cpet") {
  const nm = { rest: "rust", low: "low", peak: "piek" };
  for (const s of which) add(`${prefix}_${s}`, `${label} ${nm[s]}`, domain, "num", { unit, dec, group, source });
}

// header
add("ead", "EAD nr", "header", "text");
add("visit_date", "Datum bezoek", "header", "date");
add("lab_date", "Datum bloedname", "header", "text");
add("age", "Leeftijd", "header", "num", { unit: "jaar", dec: 0 });
add("sex", "Geslacht", "header", "select", { options: ["", "M", "V"], cf: true });
add("diagnosis", "Diagnose", "header", "text", { cf: true, help: "bv. een hypoplastisch linkerhartsyndroom" });
add("fontan_details", "Fontan details", "header", "text", { cf: true, help: "bv. Norwood, Glenn, 18mm extracardiale TCPC" });
add("fenestration", "Fenestratie", "header", "select", { options: ["", "geen", "open", "gesloten", "onbekend"], cf: true });
add("history_extra", "Bijkomende voorgeschiedenis (zin na intro)", "header", "longtext", { cf: true });
add("meds_text", "Thuistherapie", "header", "longtext", { source: "cpet" });

// cardiovascular
let g = "Kliniek";
add("symptoms", "Klachten aanwezig", "cv", "multi", { group: g, options: ["dyspnoe", "duizeligheid", "hoofdpijn", "palpitaties", "syncope", "thoracale pijn", "oedeem", "vermoeidheid"] });
add("nyha", "NYHA klasse", "cv", "select", { options: ["", "I", "II", "III", "IV"], group: g });
add("congestion", "Systeemveneuze stuwing", "cv", "select", { options: YN, group: g });
add("spo2_clinic", "Saturatie rust (raadpleging)", "cv", "num", { unit: "%", dec: 0, group: g });
add("hr_clinic", "Pols (raadpleging)", "cv", "num", { unit: "/min", dec: 0, group: g });
add("sbp_clinic", "SBD (raadpleging)", "cv", "num", { unit: "mmHg", dec: 0, group: g });
add("dbp_clinic", "DBD (raadpleging)", "cv", "num", { unit: "mmHg", dec: 0, group: g });
add("smoking", "Roken", "cv", "select", { options: ["", "niet", "ex-roker", "actief"], group: g });
add("ecg_rhythm", "ECG ritme", "cv", "select", { group: g, options: ["", "sinusritme", "junctioneel ritme", "atriale flutter/IART", "voorkamerfibrillatie", "atriale pacing", "ventriculaire pacing"] });
add("ecg_rate", "ECG frequentie", "cv", "num", { unit: "/min", dec: 0, group: g });
add("ecg_change", "ECG t.o.v. vorige", "cv", "select", { options: ["", "essentieel onveranderd", "gewijzigd"], group: g });
add("ecg_comment", "ECG commentaar", "cv", "text", { group: g });
g = "Echo & biomarkers";
add("echo_connections", "Fontan connecties", "cv", "select", { options: ["", "mooi/patent", "stenose", "niet beoordeelbaar"], group: g });
add("vent_function", "Ventrikelfunctie", "cv", "select", { group: g, options: ["", "goede", "licht verminderde", "matig verminderde", "ernstig verminderde"] });
add("lvef", "EF systemische ventrikel", "cv", "num", { unit: "%", dec: 0, group: g });
add("avv_name", "Systemische AV-klep (naam)", "cv", "text", { cf: true, group: g, help: "bv. mitralisklep" });
add("avv_regurg", "AV-klep insufficiëntie", "cv", "select", { options: GRADE, group: g });
add("slv_name", "Semilunaire klep (naam)", "cv", "text", { cf: true, group: g, help: "bv. neo-aortaklep" });
add("slv_regurg", "Semilunaire klep insufficiëntie", "cv", "select", { options: GRADE, group: g });
add("echo_comment", "Echo commentaar", "cv", "longtext", { group: g, help: "kleine letter = achter de echozin, bv. stabiel t.o.v. vorige" });
add("ntprobnp", "NT-proBNP", "cv", "num", { unit: "pg/mL", dec: 0, group: g });
add("ntprobnp_interp", "NT-proBNP interpretatie", "cv", "select", { options: ["", "normaal", "verhoogd"], group: g });
add("swe_septal", "Septale SWE", "cv", "num", { unit: "m/s", dec: 2, group: g, help: "referentie 3 ± 0,6 m/s" });
g = "CPET — capaciteit";
add("rer_rest", "RER rust", "cv", "num", { dec: 2, group: g, source: "cpet" });
add("rer_low", "RER low", "cv", "num", { dec: 2, group: g, source: "cpet" });
add("rer_peak", "RER piek", "cv", "num", { dec: 2, group: g, source: "cpet" });
add("peak_load_w", "Piekbelasting", "cv", "num", { unit: "W", dec: 0, group: g, source: "cpet" });
add("protocol_start_w", "Protocol aanvang", "cv", "num", { unit: "W", dec: 0, group: g, source: "cpet" });
add("protocol_slope_w", "Protocol slope", "cv", "num", { unit: "W/min", dec: 0, group: g, source: "cpet" });
stages("vo2", "VO2", "cv", "ml/min", 0, g);
stages("vco2", "VCO2", "cv", "ml/min", 0, g);
add("vo2kg_peak", "Piek VO2", "cv", "num", { unit: "ml/kg/min", dec: 1, group: g, source: "cpet" });
add("vo2_pct_wasserman", "Piek VO2 % voorspeld (Wasserman)", "cv", "num", { unit: "%", dec: 1, group: g, source: "cpet" });
add("vo2_pct_glaser", "Piek VO2 % voorspeld (Glaser)", "cv", "num", { unit: "%", dec: 1, group: g, source: "cpet" });
stages("o2pulse", "O2-pols", "cv", "ml", 1, g);
g = "CPET — hartfrequentie & bloeddruk";
stages("hr", "HR", "cv", "/min", 0, g);
add("hr_pct_pred_peak", "HR piek % voorspeld (labo)", "cv", "num", { unit: "%", dec: 0, group: g, source: "cpet" });
stages("sbp", "SBD", "cv", "mmHg", 0, g);
stages("dbp", "DBD", "cv", "mmHg", 0, g);
stages("load", "Belasting", "cv", "W", 0, g);
g = "Inspanningsecho & PVP";
stages("lvot_vti", "LVOT VTI", "cv", "cm", 1, g);
stages("sv", "SV", "cv", "ml", 1, g);
stages("co", "CO", "cv", "L/min", 1, g);
stages("pvp", "PVP (Fontandruk)", "cv", "mmHg", 1, g);
stages("trpg", "TRPG (rij)", "cv", "mmHg", 1, g);
for (const [k, l] of [["mv_e", "MV E"], ["mv_a", "MV A"], ["e_lat", "E' lat"], ["e_e_lat", "E/E' lat"], ["e_a", "E/A"]]) stages(k, l, "cv", "", 1, g);
add("mpap_rest", "mPAP rust (labo)", "cv", "num", { unit: "mmHg", group: g, source: "cpet" });
add("mpap_peak", "mPAP piek (labo)", "cv", "num", { unit: "mmHg", group: g, source: "cpet" });
add("mpap_co_slope", "mPAP/CO slope (labo)", "cv", "num", { unit: "mmHg/L/min", group: g, source: "cpet" });
add("svi_peak_lab", "SVi piek (labo)", "cv", "num", { unit: "ml/m²", dec: 0, group: g, source: "cpet" });
add("co_agostoni_pct", "Piek CO Agostoni", "cv", "num", { unit: "% pred", group: g, source: "cpet" });
add("co_boston_pct", "Piek CO Boston", "cv", "num", { unit: "% pred", group: g, source: "cpet" });
add("co_reserve_mayo_pct", "CO reserve Mayo", "cv", "num", { unit: "% pred", group: g, source: "cpet" });
g = "Morfologie rust & labo-besluit";
for (const [k, l, u, d] of [["lvotd", "LVOTD", "cm", 1], ["ivsd", "IVSd", "mm", 0], ["lvedd", "LVEDD", "mm", 0], ["pwd", "PWd", "mm", 0], ["rwt", "RWT", "", 2], ["lvmi", "LVMI", "g/m²", 0]])
  add(k, l, "cv", "num", { unit: u, dec: d, group: g, source: "cpet" });
for (const [k, l] of [["valve_tv", "Tricuspidalisklep"], ["valve_pv", "Pulmonalisklep"], ["valve_mv", "Mitralisklep"], ["valve_av", "Aortaklep"]])
  add(k, l + " (labo)", "cv", "text", { group: g, source: "cpet" });
add("valve_comment", "Kleppen commentaar inspanning", "cv", "text", { group: g, source: "cpet" });
add("repol", "Repolarisatiestoornissen", "cv", "text", { group: g, source: "cpet" });
add("arrhythmia_ex", "Aritmieën bij inspanning", "cv", "text", { group: g, source: "cpet" });
add("cpet_besluit", "CPET besluit (labo)", "cv", "longtext", { group: g, source: "cpet" });
add("cpet_conclusion", "CPET conclusie (vrije tekst labo)", "cv", "longtext", { group: g, source: "cpet" });
add("cv_free", "Vrije tekst cardiovasculair", "cv", "longtext", { group: "Vrije tekst" });

// pulmonic
g = "Spirometrie & ventilatie";
for (const [k, l, u, d] of [["fev1", "FEV1", "L", 2], ["fev1_pct", "FEV1 % voorspeld", "%", 0], ["fvc", "FVC", "L", 2], ["tiffeneau", "Tiffeneau index", "", 2],
  ["peak_ve", "Piek VE", "L/min", 0], ["mvv", "MVV", "L/min", 0], ["ve_mvv", "VE/MVV", "", 2], ["ve_vco2_slope", "VE/VCO2 slope", "", 1],
  ["petco2_rest", "PETCO2 rust", "mmHg", 1], ["petco2_peak", "PETCO2 piek", "mmHg", 1], ["spo2_rest", "SpO2 rust (CPET)", "%", 0], ["spo2_peak", "SpO2 piek (CPET)", "%", 0]])
  add(k, l, "pulm", "num", { unit: u, dec: d, group: g, source: "cpet" });
add("diaphragm", "Diafragma", "pulm", "text", { cf: true, group: "Kliniek", help: "bv. diafragmaparese links waarvoor plicatuur" });
add("pulm_free", "Vrije tekst pulmonaal", "pulm", "longtext", { group: "Vrije tekst" });

// peripheral
g = "Lichaamssamenstelling & activiteit";
add("weight_kg", "Gewicht (raadpleging)", "periph", "num", { unit: "kg", group: g });
add("weight_prev", "Eerdere gewichten", "periph", "text", { group: g, help: "uit klinisch onderzoek, bv. 70 - 68" });
add("height_cm", "Lengte", "periph", "num", { unit: "cm", group: g });
add("weight_cpet", "Gewicht (CPET)", "periph", "num", { unit: "kg", group: g, source: "cpet" });
add("bmi_cpet", "BMI (CPET)", "periph", "num", { unit: "kg/m²", group: g, source: "cpet" });
add("bsa", "BSA", "periph", "num", { unit: "m²", dec: 3, group: g, source: "cpet" });
add("weight_trend", "Gewichtsevolutie", "periph", "select", { options: ["", "stabiel", "gewichtsverlies", "gewichtstoename"], group: g });
add("activity", "Fysieke activiteit", "periph", "select", { options: ["", "sedentair", "recreatief actief", "regelmatig sportend"], group: g });
g = "Extractie & ijzer";
for (const [k, l, u, d] of [["dco_dvo2", "dCO/dVO2", "", 1], ["cavo2_peak", "C(a-v)O2 piek", "ml/dl", 1], ["cavo2_hb", "C(a-v)O2 piek / Hb", "ml/g", 2],
  ["svo2_mixed", "Gemengd veneuze saturatie (labo)", "%", 0], ["hb", "Hb", "g/dl", 1]])
  add(k, l, "periph", "num", { unit: u, dec: d, group: g, source: "cpet" });
add("ferritin", "Ferritine", "periph", "num", { unit: "µg/L", dec: 0, group: g });
add("tsat", "Transferrinesaturatie", "periph", "num", { unit: "%", dec: 0, group: g });
add("iron_supp", "IJzersuppletie", "periph", "select", { options: YN, group: g });
add("periph_free", "Vrije tekst perifeer", "periph", "longtext", { group: "Vrije tekst" });

// liver
g = "Beeldvorming";
add("us_date", "Echo lever (datum)", "liver", "text", { group: g });
add("us_prev_date", "Echo lever vergeleken met", "liver", "text", { group: g });
add("us_findings", "Echo bevindingen", "liver", "multi", { group: g, options: ["geen afwijkingen", "hepatomegalie", "nodulaire contour", "heterogeen parenchym", "focaal letsel", "splenomegalie", "ascites", "portale hypertensietekenen", "portosystemische collateralen/shunt", "hepatofugale portale flow"] });
add("spleen_cm", "Milt (lengte)", "liver", "num", { unit: "cm", group: g });
add("us_conclusion", "Conclusie echo lever", "liver", "longtext", { group: g });
add("lsm_kpa", "Leverstijfheid (LSM)", "liver", "num", { unit: "kPa", group: g });
add("lsm_method", "Elastografie methode", "liver", "select", { options: ["", "VCTE/FibroScan", "2D-SWE", "pSWE", "MR-elastografie"], group: g });
g = "Labo";
for (const [k, l, u, d] of [["platelets", "Trombocyten", "×10⁹/L", 0], ["ast", "AST", "U/L", 0], ["ast_uln", "AST bovengrens", "U/L", 0], ["alt", "ALT", "U/L", 0],
  ["ggt", "GGT", "U/L", 0], ["bilirubin", "Bilirubine", "mg/dL", 2], ["inr", "INR", "", 2], ["afp", "AFP", "µg/L", 1]])
  add(k, l, "liver", "num", { unit: u, dec: d, group: g });
add("afp_interp", "AFP interpretatie", "liver", "select", { options: ["", "normaal", "verhoogd"], group: g });
g = "Gastroscopie & scores";
add("egd_date", "Laatste gastroscopie (jaar)", "liver", "text", { cf: true, group: g });
add("varices", "Varices", "liver", "select", { options: ["", "geen", "graad 1", "graad 2", "graad 3", "niet onderzocht"], cf: true, group: g });
add("egd_next", "Volgende gastroscopie (jaar)", "liver", "text", { cf: true, group: g });
add("egd_note", "Opmerking gastroscopie", "liver", "text", { cf: true, group: g, help: "bv. Cave: sedatie bij volgende gastroscopie" });
add("fonliver", "FonLiver risk score (manueel)", "liver", "num", { group: g });
add("liver_free", "Vrije tekst lever", "liver", "longtext", { group: "Vrije tekst" });

// kidney
add("creatinine", "Creatinine", "kidney", "num", { unit: "mg/dL", dec: 2 });
add("egfr", "eGFR (labo; leeg = CKD-EPI 2021)", "kidney", "num", { unit: "ml/min/1,73m²", dec: 0 });
add("acr", "Albumine/creatinine ratio", "kidney", "num", { unit: "mg/g", dec: 0 });
add("kidney_free", "Vrije tekst nier", "kidney", "longtext");

// lymphatic
add("ple", "PLE", "lymph", "select", { options: ["", "geen argumenten", "vermoeden", "bevestigd"] });
add("albumin", "Albumine", "lymph", "num", { unit: "g/L", dec: 1 });
add("lymphocytes", "Lymfocyten (absoluut)", "lymph", "num", { unit: "×10⁹/L", dec: 2 });
add("a1at_stool", "Alfa-1-antitrypsine faeces", "lymph", "num", { unit: "mg/g", dec: 2 });
add("plastic_bronchitis", "Plastische bronchitis", "lymph", "select", { options: ["", "geen argumenten", "vermoeden", "bevestigd"] });
add("lymph_imaging", "Lymfatische beeldvorming/interventie", "lymph", "text", { cf: true });
add("lymph_free", "Vrije tekst lymfatisch", "lymph", "longtext");

// collaterals
add("vv_collat", "Veno-veneuze collateralen", "collat", "select", { options: ["", "geen gekend", "aanwezig", "geëmboliseerd"], cf: true });
add("ap_collat", "Aortopulmonale collateralen", "collat", "select", { options: ["", "geen gekend", "aanwezig", "geëmboliseerd"], cf: true });
add("collat_free", "Vrije tekst collateralen", "collat", "longtext", { cf: true });

// venous
add("venous_text", "Veneuze voorgeschiedenis", "venous", "longtext", { cf: true, help: "bv. trombose vena femoralis na katheterisatie" });
add("venous_free", "Vrije tekst veneus (dit bezoek)", "venous", "longtext");

// other
add("arrhythmia_hx", "Aritmie voorgeschiedenis", "other", "text", { cf: true });
add("thrombo_hx", "Trombo-embolie voorgeschiedenis", "other", "text", { cf: true });
add("anticoag", "Antitrombotica", "other", "select", { options: ["", "geen", "aspirine", "VKA", "DOAC", "LMWH"] });
add("other_free", "Vrije tekst overige", "other", "longtext");

// psychosocial
add("work", "Werk/studie", "psych", "select", { options: ["", "voltijds werkend", "deeltijds werkend", "student", "werkzoekend", "arbeidsongeschikt", "gepensioneerd"] });
add("work_text", "Werk/studie detail", "psych", "text");
add("psych_wellbeing", "Psychisch welzijn", "psych", "select", { options: ["", "geen problemen", "moeilijkheden, geen begeleiding", "begeleiding lopend", "begeleiding voorzien"] });
add("social", "Sociale situatie", "psych", "text");
add("reproductive", "Anticonceptie/kinderwens", "psych", "text");
add("psych_free", "Vrije tekst psychosociaal", "psych", "longtext");

// plan
add("next_months", "Volgende controle over", "plan", "num", { unit: "maanden", dec: 0 });
add("next_tests", "Volgende controle met", "plan", "multi", { options: ["ecg", "CPETechoPVP", "echo lever", "elastografie", "bloedname", "gastroscopie", "CMR", "Holter", "24u-urine"] });
add("plan_free", "Vrije tekst beleid", "plan", "longtext");

const EXPECTED_SOURCE = {
  consult: ["diagnosis", "fontan_details", "fenestration", "symptoms", "nyha", "congestion", "spo2_clinic", "hr_clinic", "sbp_clinic", "dbp_clinic", "smoking",
    "ecg_rhythm", "ecg_rate", "ecg_change", "ecg_comment", "echo_connections", "vent_function", "lvef", "avv_name", "avv_regurg", "slv_name", "slv_regurg",
    "diaphragm", "weight_kg", "weight_prev", "height_cm", "weight_trend", "activity", "iron_supp", "venous_text", "arrhythmia_hx", "thrombo_hx", "anticoag",
    "collat_free", "work", "work_text", "psych_wellbeing", "meds_text"],
  lab: ["lab_date", "hb", "ntprobnp", "ntprobnp_interp", "ferritin", "tsat", "platelets", "ast", "ast_uln", "alt", "ggt", "bilirubin", "inr", "afp", "afp_interp",
    "creatinine", "egfr", "acr", "albumin", "lymphocytes", "a1at_stool"],
  liver: ["us_date", "us_prev_date", "us_findings", "spleen_cm", "us_conclusion", "lsm_kpa", "lsm_method"],
};
for (const [src, keys] of Object.entries(EXPECTED_SOURCE)) for (const k of keys) { const f = FIELDS.find(x => x.key === k); if (!f) throw new Error("unknown " + k); f.source = src; }
const FIELD = Object.fromEntries(FIELDS.map(f => [f.key, f]));
if (Object.keys(FIELD).length !== FIELDS.length) throw new Error("duplicate field key");

function searchFields(q) {
  const toks = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  return FIELDS.filter(f => {
    const hay = [f.key, f.label, f.unit, DOMAIN_LABEL[f.domain], f.group, f.help].join(" ").toLowerCase();
    return toks.every(t => hay.includes(t));
  });
}

/* ---------------------------------------------------------------- text helpers (shared by all parsers) */
function sentencesOf(t) { return String(t || "").split(/(?<=[.!?])\s+(?=[A-ZÀ-Ü(])|\n+/).map(s => s.trim()).filter(Boolean); }
/* 'pos' if re occurs in a sentence without a preceding negation (geen/niet/zonder), 'neg' if only negated, null if absent */
function polarity(text, re) {
  let res = null;
  for (const s of sentencesOf(text)) {
    const m = s.match(re); if (!m) continue;
    const before = s.slice(0, m.index).toLowerCase().split(/\b(?:maar|wel|echter|doch)\b/).pop();
    if (/\b(geen|niet|zonder|nooit)\b/.test(before)) { if (res === null) res = "neg"; } else res = "pos";
  }
  return res;
}
/* regurgitation grade from free text: '2+/4', 'Lichte MI (1/4)', 'geen MI / stenose: ...' */
function gradeFrom(text) {
  const s = String(text || "").toLowerCase().split(/stenose/)[0];
  if (!s.trim()) return null;
  const m = s.match(/(\d)\s*\+?\s*(?:(?:a|à|-|tot)\s*\d\s*\+?\s*)?\/\s*4/);
  if (m) { const g = +m[1]; return g <= 1 ? "licht" : g === 2 ? "matig" : "ernstig"; }
  if (/\bgeen\b|\bafwezig/.test(s)) return "geen";
  if (/ernstig|belangrijk|severe/.test(s)) return "ernstig";
  if (/matig|moderate/.test(s)) return "matig";
  if (/licht|minim|trivi|discreet|mild|beperkt/.test(s)) return "licht";
  return null;
}

/* ---------------------------------------------------------------- PARSER (CPETechoPVP) */
const ROW_MAP = {
  "hr": "hr", "vo2": "vo2", "rer": "rer", "vco2": "vco2", "o2/hr": "o2pulse",
  "hr % pred": ["scalar", "hr_pct_pred_peak"], "vo2 gew": ["scalar", "vo2kg_peak"],
  "saturatie o2": "spo2", "belasting": "load", "bd systolisch": "sbp", "bd diastolisch": "dbp",
  "lvot vti": "lvot_vti", "mv e vel": "mv_e", "mv a vel": "mv_a", "e' lat": "e_lat", "e/e' lat": "e_e_lat",
  "e/a ratio": "e_a", "trpg": "trpg", "rap": "pvp", "fontan": "pvp", "fontandruk": "pvp", "pvp": "pvp",
  "sv": "sv", "co": "co",
};
const STAGE_SUBSET = { spo2: ["rest", "peak"] };
const PULM_MAP = {
  "fev1": "fev1", "fev1 %pred": "fev1_pct", "fvc": "fvc", "tiffeneau index": "tiffeneau", "rest petco2": "petco2_rest",
  "peak ve": "peak_ve", "mvv": "mvv", "peak ve/mvv": "ve_mvv", "ve/vco2 slope": "ve_vco2_slope", "peak petco2": "petco2_peak",
};
const KV_NUM = {
  "gewicht": "weight_cpet", "lengte": "height_cm", "bmi": "bmi_cpet", "bsa": "bsa", "hb": "hb",
  "lvotd": "lvotd", "ivsd": "ivsd", "lvedd": "lvedd", "pwd": "pwd", "rwt": "rwt", "lvmi": "lvmi",
  "protocol aanvang": "protocol_start_w", "protocol slope": "protocol_slope_w", "piek belasting": "peak_load_w",
  "mpap rust": "mpap_rest", "mpap peak": "mpap_peak", "mpap/co slope": "mpap_co_slope",
  "peak exercise svi": "svi_peak_lab", "peak co by agostoni": "co_agostoni_pct", "peak co by boston": "co_boston_pct",
  "co reserve by mayo": "co_reserve_mayo_pct", "dco/dvo2": "dco_dvo2", "a-v o2 diff peak": "cavo2_peak",
  "a-v o2 diff peak / hb": "cavo2_hb", "gemengd veneuze saturatie": "svo2_mixed",
};
const KV_TEXT = {
  "tricuspedalis insuff": "valve_tv", "tricuspidalis insuff": "valve_tv", "pulmonalis insuff": "valve_pv",
  "mitralis insuff": "valve_mv", "aorta insuff": "valve_av", "commentaar": "valve_comment",
  "repolarisatiestoornissen": "repol", "aritmieën": "arrhythmia_ex", "aritmieen": "arrhythmia_ex",
};
const STAGES = ["rest", "low", "peak"];

function _norm(label) {
  return label.replace(/\([^)]*\)/g, "").replace(/\*/g, " ").trim().toLowerCase()
    .replace(/\s+/g, " ").replace(/^[\s:]+|[\s:]+$/g, "");
}
function _nums(s) { return (s.match(/-?\d+(?:[.,]\d+)?/g) || []).map(x => parseFloat(x.replace(",", "."))); }
function _first(s) { const n = _nums(s); return n.length ? n[0] : null; }

function parseReport(text) {
  const values = {}, status = {}, notes = [];
  const put = (k, v, st = "parsed") => {
    if (v === null || v === undefined || v === "") return;
    if (values[k] !== undefined && values[k] !== null && values[k] !== "") return;
    values[k] = v; status[k] = st;
  };
  let section = null, refOrder = ["wasserman", "glaser"];
  const besluit = [], conclusion = [], meds = [];

  for (const raw of (text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const low = line.toLowerCase();
    if (/^[-_=|\s]+$/.test(line)) continue;
    if (low.startsWith("thuistherapie")) { section = "meds"; continue; }
    if (low.startsWith("biochemie") || low.startsWith("basismetingen") || low.startsWith("indicatie")) {
      section = null; if (!low.startsWith("indicatie")) continue;
    }
    if (low.startsWith("besluit")) { section = "besluit"; continue; }
    if (low.startsWith("cpet:")) { section = "cpet"; continue; }
    if (low.startsWith("inspanningsecho metingen")) { section = "echo"; continue; }
    if (low === "pulmonaal") { section = "pulm"; continue; }
    if (low.includes("wasserman") && low.includes("glaser")) {
      refOrder = low.indexOf("wasserman") < low.indexOf("glaser") ? ["wasserman", "glaser"] : ["glaser", "wasserman"];
      continue;
    }
    if (section === "meds") {
      if (line.startsWith("*")) { meds.push(line.replace(/^\*\s*/, "").trim()); continue; }
      section = null;
    }
    if (section === "besluit") {
      if (line.startsWith("*")) {
        const it = line.replace(/^\*\s*/, "").trim(); const i = it.indexOf(":");
        if (i >= 0 && it.slice(i + 1).trim()) besluit.push(it);
      } else conclusion.push(line);
      continue;
    }
    if (line.startsWith("|")) {
      const cells = line.replace(/^\|+|\|+$/g, "").split("|").map(c => c.trim());
      if (!cells.length) continue;
      const label = _norm(cells[0]), rest = cells.slice(1);
      if (section === "pulm" && cells.length >= 4) {
        for (const [lab, val] of [[cells[0], cells[1]], [cells[2], cells[3]]]) {
          const k = PULM_MAP[_norm(lab)]; if (k) put(k, _first(val));
        }
        continue;
      }
      const target = ROW_MAP[label];
      if (target === undefined) {
        if (_nums(rest.join(" ")).length && label !== "hfa-peff score") notes.push(`Onbekende tabelrij genegeerd: ‘${cells[0]}’`);
        continue;
      }
      if (Array.isArray(target)) { const v = _nums(rest.join(" ")); if (v.length) put(target[1], v[v.length - 1]); continue; }
      if (rest.length >= 2) {
        rest.slice(0, 3).forEach((c, i) => { const s = STAGES[i]; if ((STAGE_SUBSET[target] || STAGES).includes(s)) put(`${target}_${s}`, _first(c)); });
      } else {
        const v = rest.length ? _nums(rest[0]) : [];
        if (v.length >= 3) STAGES.forEach((s, i) => put(`${target}_${s}`, v[i]));
        else if (v.length === 2) {
          CONFIG.TWO_VALUE_STAGES.forEach((s, i) => put(`${target}_${s}`, v[i]));
        } else if (v.length === 1) {
          put(`${target}_rest`, v[0], "ambiguous");
          notes.push(`‘${cells[0]}’: 1 waarde, toegekend aan rust — controleren`);
        }
      }
      continue;
    }
    const ci = line.indexOf(":");
    if (ci >= 0) {
      const lab = line.slice(0, ci), val = line.slice(ci + 1).trim(), nlab = _norm(lab);
      if (nlab.startsWith("peak vo2") && lab.toLowerCase().includes("predicted")) {
        _nums(val).forEach((v, i) => { if (refOrder[i]) put(`vo2_pct_${refOrder[i]}`, v); });
        continue;
      }
      if (KV_NUM[nlab]) { put(KV_NUM[nlab], _first(val)); continue; }
      if (KV_TEXT[nlab] && val) { put(KV_TEXT[nlab], val); continue; }
    }
  }
  if (meds.length) put("meds_text", meds.join("; "));
  if (besluit.length) put("cpet_besluit", besluit.join("\n"));
  if (conclusion.length) put("cpet_conclusion", conclusion.join(" "));
  // CPET also hints at fields whose primary source is the echo report (lower priority, orange)
  const lvm = (values.cpet_besluit || "").match(/LV systolische functie in rust:\s*([^\n(]+)/i);
  if (lvm && /normaal/i.test(lvm[1])) put("vent_function", "goede", "ambiguous");
  if (/patente connecties/i.test(values.cpet_conclusion || "")) put("echo_connections", "mooi/patent", "ambiguous");
  const ga = gradeFrom(values.valve_av || "");
  if (ga) put("slv_regurg", ga, "ambiguous");
  if (values.pvp_rest === undefined) notes.push("Geen PVP-rij gevonden (verwacht ‘RAP’, ‘Fontan’ of ‘PVP’ in het TRPG-blok).");
  if (values.pwd !== undefined && values.pwd < 5) notes.push("PWd lijkt in cm i.p.v. mm — controleren.");
  return { values, status, notes };
}

/* ---------------------------------------------------------------- DERIVE */
const DERIVED_META = {
  d_vo2_pred_friend: ["Voorspelde piek VO2 (FRIEND, fiets)", "cv", "ml/kg/min"],
  d_vo2_pred_friend_abs: ["Voorspelde piek VO2 (FRIEND, absoluut)", "cv", "ml/min"],
  d_vo2_pct_friend: ["Piek VO2 % voorspeld (FRIEND)", "cv", "%"],
  d_effort_maximal: ["Maximale test (RER > drempel)", "cv", "0/1"],
  d_vo2_reduced: ["Verminderde capaciteit", "cv", "0/1"],
  d_svi_rest: ["SVi rust", "cv", "ml/m²"],
  d_svi_peak: ["SVi piek", "cv", "ml/m²"],
  d_dsvi_pct: ["ΔSVi rust→piek", "cv", "%"],
  d_preload_limited: ["Preload-limitatie (ΔSVi ≤ drempel)", "cv", "0/1"],
  d_pvp_co_slope: ["PVP-CO slope", "cv", "mmHg/L/min"],
  d_pvp_slope_high: ["PVP-CO slope verhoogd", "cv", "0/1"],
  d_pvp_at_x_vo2: ["VO2 bij 33% van voorspelde piek-VO2", "cv", "ml/min"],
  d_pvp_at_x: ["PVP@33% voorspelde piek-VO2 (geïnterpoleerd)", "cv", "mmHg"],
  d_pvp_at_x_high: ["PVP@33% verhoogd (> 19,2 mmHg)", "cv", "0/1"],
  d_dspo2: ["Daling SpO2 rust→piek", "pulm", "%-punt"],
  d_desaturation: ["Desaturatie bij inspanning", "pulm", "0/1"],
  d_mvv_used: ["MVV gebruikt", "pulm", "L/min"],
  d_ve_mvv_used: ["VE/MVV gebruikt", "pulm", ""],
  d_breathing_reserve: ["Ademreserve", "pulm", "%"],
  d_vent_limited: ["Ventilatoire limitatie", "pulm", "0/1"],
  d_vent_class: ["Ventilatoire klasse (Arena)", "pulm", ""],
  d_spiro_pattern: ["Spirometrisch patroon", "pulm", ""],
  d_bmi: ["BMI (gewicht raadpleging, anders CPET)", "periph", "kg/m²"],
  d_cao2_expected: ["Verwachte CaO2 piek (1,34·Hb·SpO2)", "periph", "ml/dl"],
  d_svo2_implied: ["Impliciete gemengd veneuze saturatie", "periph", "%"],
  d_co_plausibility_warn: ["Piek-CO vermoedelijk onderschat", "periph", "0/1"],
  d_extraction_limited: ["Verminderde O2-extractie", "periph", "0/1"],
  d_iron_deficiency: ["IJzerdeficiëntie", "periph", "0/1"],
  d_egfr_used: ["eGFR gebruikt", "kidney", "ml/min/1,73m²"],
  d_egfr_source: ["eGFR bron", "kidney", ""],
  d_albuminuria: ["Albuminurie categorie", "kidney", ""],
  d_meld_xi: ["MELD-XI", "liver", ""],
  d_apri: ["APRI", "liver", ""],
  d_fib4: ["FIB-4", "liver", ""],
  d_vast: ["VAST score", "liver", "/4"],
  d_vast_complete: ["VAST volledig", "liver", "0/1"],
};

const _v = (d, k) => (d[k] === "" || d[k] === undefined || d[k] === null || (Array.isArray(d[k]) && !d[k].length)) ? null : d[k];
const _ok = (...xs) => xs.every(x => x !== null && x !== undefined);
const f1 = (x, dec = 1) => (x === null || x === undefined || Number.isNaN(x)) ? "—" : (CONFIG.DECIMAL_COMMA ? Number(x).toFixed(dec).replace(".", ",") : Number(x).toFixed(dec));

function interp(xs, ys, x) {
  const pts = xs.map((a, i) => [a, ys[i]]).filter(p => p[0] !== null && p[1] !== null).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2 || x < pts[0][0] || x > pts[pts.length - 1][0]) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x0 <= x && x <= x1 && x1 !== x0) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return null;
}
function ckdEpi2021(scr, age, sex) {
  const fem = sex === "V", k = fem ? 0.7 : 0.9, a = fem ? -0.241 : -0.302;
  const e = 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2) * Math.pow(0.9938, age);
  return fem ? e * 1.012 : e;
}

function compute(d) {
  const T = CONFIG.T, D = {}, flags = [];
  const flag = (domain, item, value, status, note = "") => flags.push({ domain, item, value, status, note });
  const age = _v(d, "age"), sex = _v(d, "sex");

  // effort & capacity
  const rer = _v(d, "rer_peak");
  if (rer !== null) {
    D.d_effort_maximal = +(rer > T.rer_maximal);
    flag("cv", "Inspanning", `RER ${f1(rer, 2)}`, D.d_effort_maximal ? "ok" : "warn",
      D.d_effort_maximal ? "maximaal" : `submaximaal (RER ≤ ${T.rer_maximal}) — interpretatie onder voorbehoud`);
  }
  const wF = _v(d, "weight_cpet") ?? _v(d, "weight_kg"), hF = _v(d, "height_cm");
  if (_ok(age, sex, wF, hF)) {
    D.d_vo2_pred_friend = 45.2 - 0.35 * age - 10.9 * (sex === "V" ? 2 : 1) - 0.15 * (wF * 2.20462) + 0.68 * (hF / 2.54) - 0.46 * CONFIG.EXERCISE_MODE;
    D.d_vo2_pred_friend_abs = D.d_vo2_pred_friend * wF;
  }
  const vk = _v(d, "vo2kg_peak") ?? (_ok(_v(d, "vo2_peak"), wF) ? d.vo2_peak / wF : null);
  if (vk !== null && D.d_vo2_pred_friend) {
    const pct = vk / D.d_vo2_pred_friend * 100;
    D.d_vo2_pct_friend = pct; D.d_vo2_reduced = +(pct < T.peak_vo2_pct_pred);
    flag("cv", "Piek VO2", `${f1(vk)} ml/kg/min · ${f1(pct, 0)}% van FRIEND (${f1(D.d_vo2_pred_friend)})`, D.d_vo2_reduced ? "abn" : "ok");
  } else flag("cv", "Piek VO2", vk !== null ? `${f1(vk)} ml/kg/min` : "—", "na", "leeftijd, geslacht, lengte en gewicht nodig voor FRIEND");

  // stroke volume
  const bsa = _v(d, "bsa"), svr = _v(d, "sv_rest"), svp = _v(d, "sv_peak");
  if (_ok(bsa, svr, svp) && bsa) {
    D.d_svi_rest = svr / bsa; D.d_svi_peak = svp / bsa;
    D.d_dsvi_pct = (D.d_svi_peak - D.d_svi_rest) / D.d_svi_rest * 100;
    D.d_preload_limited = +(D.d_dsvi_pct <= T.dsvi_pct);
    flag("cv", "ΔSVi", `${f1(D.d_svi_rest, 0)}→${f1(D.d_svi_peak, 0)} ml/m² (${D.d_dsvi_pct >= 0 ? "+" : ""}${f1(D.d_dsvi_pct, 0)}%)`,
      D.d_preload_limited ? "abn" : "ok", D.d_preload_limited ? "preload-limitatie" : "");
  } else flag("cv", "ΔSVi", "—", "na");

  // PVP
  const co = STAGES.map(s => _v(d, `co_${s}`)), pvp = STAGES.map(s => _v(d, `pvp_${s}`));
  let slope = null;
  if (CONFIG.PVP_SLOPE_METHOD === "two_point") {
    if (_ok(co[0], co[2], pvp[0], pvp[2]) && co[2] !== co[0]) slope = (pvp[2] - pvp[0]) / (co[2] - co[0]);
  } else {
    const pts = co.map((x, i) => [x, pvp[i]]).filter(p => _ok(p[0], p[1]));
    if (pts.length >= 2) {
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
      if (sxx) slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
    }
  }
  if (slope !== null) {
    D.d_pvp_co_slope = slope; D.d_pvp_slope_high = +(slope > T.pvp_co_slope);
    flag("cv", "PVP-CO slope", `${f1(slope)} mmHg/L/min`, D.d_pvp_slope_high ? "abn" : "ok");
    const lab = _v(d, "mpap_co_slope");
    if (lab !== null && Math.abs(lab - slope) > 0.3) flag("cv", "PVP-CO slope vs labo", `berekend ${f1(slope)} vs labo ${f1(lab)}`, "warn", "verschil > 0,3");
  } else flag("cv", "PVP-CO slope", "—", "na");

  const ax = CONFIG.PVP_AT.axis;
  let xs, xTarget = CONFIG.PVP_AT.value;
  if (ax === "pct_pred_vo2") {
    xs = STAGES.map(s => _v(d, `vo2_${s}`));
    xTarget = D.d_vo2_pred_friend_abs ? CONFIG.PVP_AT.value / 100 * D.d_vo2_pred_friend_abs : null;
    if (xTarget) D.d_pvp_at_x_vo2 = xTarget;
  } else if (ax === "pct_peak_load") {
    const pl = _v(d, "load_peak") ?? _v(d, "peak_load_w");
    xs = STAGES.map(s => (pl && _v(d, `load_${s}`) !== null) ? _v(d, `load_${s}`) / pl * 100 : null);
  } else {
    const pre = ax === "load_w" ? "load" : ax;
    xs = STAGES.map(s => _v(d, `${pre}_${s}`));
  }
  const pax = xTarget === null ? null : interp(xs, pvp, xTarget);
  const tag = CONFIG.PVP_AT.confirmed ? (xTarget && ax === "pct_pred_vo2" ? `bij VO2 ${f1(xTarget, 0)} ml/min` : "") : "definitie te bevestigen";
  const pname = ax === "pct_pred_vo2" ? `PVP@${CONFIG.PVP_AT.value}% voorspelde piek-VO2` : `PVP@${CONFIG.PVP_AT.value} (${ax})`;
  if (pax !== null) {
    D.d_pvp_at_x = pax; D.d_pvp_at_x_high = +(pax > T.pvp_at_x);
    flag("cv", pname, `${f1(pax)} mmHg`, D.d_pvp_at_x_high ? "abn" : "ok", tag);
  } else flag("cv", pname, "—", "na", "buiten gemeten bereik of ontbrekend" + (tag ? "; " + tag : ""));

  // heart rate: rest and peak only (no chronotropic classification)
  const hrr = _v(d, "hr_rest"), hrp = _v(d, "hr_peak");
  if (_ok(hrr, hrp)) flag("cv", "Hartfrequentie", `${f1(hrr, 0)} → ${f1(hrp, 0)}/min`, "info");

  // pulmonic
  const sr = _v(d, "spo2_rest"), sp = _v(d, "spo2_peak");
  if (_ok(sr, sp)) {
    D.d_dspo2 = sr - sp; D.d_desaturation = +(D.d_dspo2 >= T.dspo2);
    flag("pulm", "SpO2", `${f1(sr, 0)}→${f1(sp, 0)}%`, D.d_desaturation ? "abn" : "ok");
  }
  const fev1 = _v(d, "fev1"), ve = _v(d, "peak_ve");
  const mvv = _v(d, "mvv") ?? (fev1 ? fev1 * T.mvv_factor : null);
  if (mvv) D.d_mvv_used = mvv;
  const vemvv = _v(d, "ve_mvv") ?? (_ok(ve, mvv) && mvv ? ve / mvv : null);
  if (vemvv !== null) {
    D.d_ve_mvv_used = vemvv; D.d_breathing_reserve = (1 - vemvv) * 100; D.d_vent_limited = +(vemvv > T.ve_mvv);
    flag("pulm", "VE/MVV", `${f1(vemvv, 2)} (ademreserve ${f1(D.d_breathing_reserve, 0)}%)`, D.d_vent_limited ? "abn" : "ok");
  }
  const sv = _v(d, "ve_vco2_slope");
  if (sv !== null) {
    const c = T.ve_vco2_classes;
    D.d_vent_class = sv < c[0] ? "I" : sv < c[1] ? "II" : sv < c[2] ? "III" : "IV";
    flag("pulm", "VE/VCO2 slope", `${f1(sv)} (klasse ${D.d_vent_class})`, D.d_vent_class === "I" ? "ok" : "abn");
  }
  const tiff = _v(d, "tiffeneau"), fev1p = _v(d, "fev1_pct");
  if (_ok(tiff, fev1p)) {
    D.d_spiro_pattern = tiff < T.tiffeneau_obstructive ? "obstructief" : fev1p < T.fev1_pct_low ? "suggestief restrictief" : "normaal";
    flag("pulm", "Spirometrie", `FEV1 ${f1(fev1p, 0)}% · Tiffeneau ${f1(tiff, 2)}: ${D.d_spiro_pattern}`, D.d_spiro_pattern === "normaal" ? "ok" : "abn");
  }

  // peripheral
  const hb = _v(d, "hb"), cav = _v(d, "cavo2_peak"), dco = _v(d, "dco_dvo2");
  if (dco !== null || cav !== null) {
    const lim = (dco !== null && dco > T.dco_dvo2) || (cav !== null && cav < T.cavo2_peak);
    D.d_extraction_limited = +lim;
    flag("periph", "O2-extractie", `dCO/dVO2 ${dco === null ? "—" : f1(dco)} · C(a-v)O2 ${cav === null ? "—" : f1(cav)} ml/dl`, lim ? "abn" : "ok");
  }
  if (_ok(hb, sp)) {
    D.d_cao2_expected = 1.34 * hb * sp / 100;
    if (cav !== null) D.d_svo2_implied = (D.d_cao2_expected - cav) / D.d_cao2_expected * 100;
  }
  const svo2 = _v(d, "svo2_mixed");
  const warn = (svo2 !== null && svo2 < T.svo2_implausible) || (cav !== null && D.d_cao2_expected && cav > T.cavo2_fraction_of_cao2 * D.d_cao2_expected);
  if (warn) {
    D.d_co_plausibility_warn = 1;
    flag("periph", "Plausibiliteit piek-CO", `SvO2 ${svo2 === null ? "—" : f1(svo2, 0)}% · verwachte CaO2 ${f1(D.d_cao2_expected)} ml/dl`, "warn",
      "fysiologisch onwaarschijnlijk — piek-CO (LVOT VTI) vermoedelijk onderschat; extractie-indices onbetrouwbaar");
  } else if (svo2 !== null) D.d_co_plausibility_warn = 0;
  const fer = _v(d, "ferritin"), tsat = _v(d, "tsat");
  if (fer !== null) {
    const idef = fer < T.ferritin_low || (fer < T.ferritin_mid && tsat !== null && tsat < T.tsat_low);
    D.d_iron_deficiency = +idef;
    flag("periph", "IJzerstatus", `ferritine ${f1(fer, 0)} · TSAT ${tsat ?? "—"}`, idef ? "abn" : "ok");
  } else flag("periph", "IJzerstatus", "niet bepaald", "na");

  const w = _v(d, "weight_kg") ?? _v(d, "weight_cpet"), ht = _v(d, "height_cm");
  if (_ok(w, ht) && ht) D.d_bmi = w / (ht / 100) ** 2;
  else if (_v(d, "bmi_cpet") !== null) D.d_bmi = d.bmi_cpet;

  // lab-based flags (reference limits from the pasted lab where available)
  const REF = d._ref || {};
  const hiOf = (k, def) => (REF[k] && REF[k][1] !== null && REF[k][1] !== undefined) ? REF[k][1] : def;
  const loOf = (k, def) => (REF[k] && REF[k][0] !== null && REF[k][0] !== undefined) ? REF[k][0] : def;
  const nt = _v(d, "ntprobnp");
  if (nt !== null) {
    const hi = hiOf("ntprobnp", null), bad = hi !== null ? nt > hi : d.ntprobnp_interp === "verhoogd";
    flag("cv", "NT-proBNP", `${f1(nt, 0)} pg/mL` + (hi !== null ? ` (≤ ${hi})` : ""), bad ? "abn" : "ok");
  }
  const lym = _v(d, "lymphocytes");
  if (lym !== null) { const lo = loOf("lymphocytes", 1.0); flag("lymph", "Lymfocyten", `${f1(lym, 2)} ×10⁹/L (≥ ${lo})`, lym < lo ? "abn" : "ok", lym < lo ? "lymfopenie" : ""); }
  const alb = _v(d, "albumin");
  if (alb !== null) { const lo = loOf("albumin", 35); flag("lymph", "Albumine", `${f1(alb)} g/L`, alb < lo ? "abn" : "ok"); }
  const ggt = _v(d, "ggt");
  if (ggt !== null) { const hi = hiOf("ggt", 60); flag("liver", "GGT", `${f1(ggt, 0)} U/L (≤ ${hi})`, ggt > hi ? "abn" : "ok"); }
  const pl = _v(d, "platelets");
  if (pl !== null) flag("liver", "Trombocyten", `${f1(pl, 0)} ×10⁹/L`, pl < T.platelets_low ? "abn" : "ok", pl < T.platelets_low ? "trombocytopenie" : "");
  const afpv = _v(d, "afp");
  if (afpv !== null) { const hi = hiOf("afp", 10); flag("liver", "AFP", `${f1(afpv)} µg/L (≤ ${hi})`, afpv > hi ? "abn" : "ok"); }

  // kidney
  let egfr = _v(d, "egfr"), src = "labo";
  const cr = _v(d, "creatinine");
  if (egfr === null && _ok(cr, age, sex) && cr > 0) { egfr = ckdEpi2021(cr, age, sex); src = "CKD-EPI 2021"; }
  if (egfr !== null) {
    D.d_egfr_used = egfr; D.d_egfr_source = src;
    flag("kidney", "eGFR", `${f1(egfr, 0)} (${src})`, egfr >= T.egfr_categories[1] ? "ok" : "abn");
  }
  const acr = _v(d, "acr");
  if (acr !== null) {
    D.d_albuminuria = acr < T.acr_a2 ? "A1" : acr < T.acr_a3 ? "A2" : "A3";
    flag("kidney", "Albuminurie", `ACR ${f1(acr, 0)} mg/g (${D.d_albuminuria})`, D.d_albuminuria === "A1" ? "ok" : "abn");
  }

  // liver
  const bili = _v(d, "bilirubin");
  if (_ok(bili, cr)) {
    D.d_meld_xi = 5.11 * Math.log(Math.max(bili, 1)) + 11.76 * Math.log(Math.max(cr, 1)) + 9.44;
    flag("liver", "MELD-XI", f1(D.d_meld_xi), "ok");
  }
  const plt = _v(d, "platelets"), ast = _v(d, "ast"), alt = _v(d, "alt"), uln = _v(d, "ast_uln");
  if (_ok(plt, ast, uln) && plt && uln) D.d_apri = (ast / uln) / plt * 100;
  if (_ok(plt, ast, alt, age) && plt && alt) D.d_fib4 = age * ast / (plt * Math.sqrt(alt));
  if (D.d_apri !== undefined || D.d_fib4 !== undefined)
    flag("liver", "APRI / FIB-4", `${f1(D.d_apri, 2)} / ${f1(D.d_fib4, 2)}`, "ok", "lage accuraatheid in FALD — enkel informatief");
  const us = d.us_findings || [], vari = _v(d, "varices");
  let comps = 0, known = 0; const miss = [];
  if (vari !== null && vari !== "niet onderzocht") { known++; comps += +vari.startsWith("graad"); } else miss.push("varices");
  if (us.length) { known += 2; comps += +us.includes("ascites") + +us.includes("splenomegalie"); } else miss.push("ascites", "splenomegalie");
  if (plt !== null) { known++; comps += +(plt < T.platelets_low); } else miss.push("trombocyten");
  D._vast_missing = joinNl(miss);
  if (known) {
    D.d_vast = comps; D.d_vast_complete = +(known === 4);
    flag("liver", "VAST", known === 4 ? `${comps}/4` : `≥ ${comps}/4`, comps >= 2 ? "abn" : known === 4 ? "ok" : "warn", known === 4 ? "" : `${D._vast_missing} niet gekend`);
  }
  const lsm = _v(d, "lsm_kpa");
  if (lsm !== null) flag("liver", "Leverstijfheid", `${f1(lsm)} kPa (${d.lsm_method || "methode?"})`, "ok");
  const fl = _v(d, "fonliver");
  flag("liver", "FonLiver", fl !== null ? String(fl) : "—", fl !== null ? "ok" : "na", "scoretabel niet geïmplementeerd — manuele invoer");

  // lymphatic
  const ple = _v(d, "ple"), pb = _v(d, "plastic_bronchitis");
  if (ple) flag("lymph", "PLE", ple, ple === "geen argumenten" ? "ok" : "abn");
  if (pb) flag("lymph", "Plastische bronchitis", pb, pb === "geen argumenten" ? "ok" : "abn");

  // sources: conflicts between reports + possible duplicates in the letter
  for (const c of Object.values(d._conflicts || {})) flag("src", "Bronconflict", c, "warn");
  if (typeof consistencyChecks === "function") for (const c of consistencyChecks(d)) flag("src", c.item, c.value, "warn", c.note);

  return { D, flags };
}

/* ---------------------------------------------------------------- LETTER */
const HEADINGS = ["Cardiovasculair.", "Pulmonaal.", "Perifeer.", "Eind-orgaan functie.", "Psychosociaal.", "Beleid."];
const STD_SYMPTOMS = ["dyspnoe", "duizeligheid", "hoofdpijn", "palpitaties"];

function n(x, dec = 1) {
  if (x === null || x === undefined || x === "") return "?";
  const s = Number(x).toFixed(dec);
  return CONFIG.DECIMAL_COMMA ? s.replace(".", ",") : s;
}
function joinNl(items) {
  items = items.filter(Boolean);
  if (!items.length) return "";
  return items.length === 1 ? items[0] : items.slice(0, -1).join(", ") + " en " + items[items.length - 1];
}
function sent(...parts) {
  let s = "";
  for (const p of parts) { if (!p) continue; s += (!s || ",;:)".includes(p[0])) ? p : " " + p; }
  s = s.trim();
  if (s && !".!?".includes(s[s.length - 1])) s += ".";
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}
function paras(items) {
  const out = []; let cur = [];
  for (const it of [...items, null]) {
    if (it === null) { if (cur.length) { out.push(cur.join(" ")); cur = []; } }
    else if (it) cur.push(it);
  }
  return out;
}
function section(out, heading, items) {
  const body = paras(items);
  if (body.length) out.push(heading, ...body, "");
}

function buildLetter(d, D) {
  const T = CONFIG.T, g = k => _v(d, k), male = d.sex !== "V", hij = male ? "Hij" : "Zij", out = [];

  // intro
  const age = g("age");
  let intro = `Ik zag uw ${age !== null ? n(age, 0) : ".."}-jarige patiënt${male ? "" : "e"} gekend met ${g("diagnosis") || ".."} waarvoor Fontan circulatie`;
  if (g("fontan_details")) intro += ` (${d.fontan_details})`;
  intro += " ter controle.";
  out.push(intro + (g("history_extra") ? " " + d.history_extra.trim() : ""), "");

  // cardiovasculair
  const cv = [];
  const present = g("symptoms") || [], absent = STD_SYMPTOMS.filter(s => !present.includes(s));
  if (!present.length) cv.push("Er zijn geen specifieke cardiale klachten: " + STD_SYMPTOMS.map(s => "geen " + s).join(", ") + ".");
  else cv.push(sent(`${hij} meldt ${joinNl(present)}`, absent.length ? "; geen " + absent.join(", geen ") : ""));
  if (g("nyha")) cv.push(`${hij} functioneert in NYHA klasse ${d.nyha}.`);
  if (g("smoking")) cv.push({ niet: "Niet-roker.", "ex-roker": "Ex-roker.", actief: "Actief roker." }[d.smoking] || "");
  const clin = [];
  if (g("congestion") === "nee") clin.push("klinisch geen systeemveneuze stuwing");
  else if (g("congestion") === "ja") clin.push("klinisch tekenen van systeemveneuze stuwing");
  if (g("spo2_clinic") !== null) clin.push(`saturatie in rust ${n(d.spo2_clinic, 0)}%`);
  if (g("hr_clinic") !== null) clin.push(`pols ${n(d.hr_clinic, 0)}/min`);
  if (g("sbp_clinic") !== null && g("dbp_clinic") !== null) clin.push(`bloeddruk ${n(d.sbp_clinic, 0)}/${n(d.dbp_clinic, 0)} mmHg`);
  if (clin.length) cv.push(sent(clin.join(", ")));
  if (g("ecg_rhythm")) {
    cv.push(null);
    cv.push(sent(`Het ECG toont een ${d.ecg_rhythm}`, g("ecg_rate") !== null ? `(${n(d.ecg_rate, 0)}/min)` : "",
      g("ecg_comment") ? `met ${joinNl(String(d.ecg_comment).split(/,\s*/))}` : "", g("ecg_change") ? `, ${d.ecg_change}` : ""));
  }
  const echo = [];
  if (g("echo_connections") === "mooi/patent") echo.push("mooie Fontan connecties");
  else if (g("echo_connections")) echo.push(`Fontan connecties: ${d.echo_connections}`);
  if (g("vent_function")) echo.push(`een ${d.vent_function} ventrikelfunctie` + (g("lvef") !== null ? ` (EF ${n(d.lvef, 0)}%)` : ""));
  for (const [kn, kr, def] of [["avv_name", "avv_regurg", "AV-klep"], ["slv_name", "slv_regurg", "semilunaire klep"]]) {
    const reg = g(kr), name = g(kn) || def;
    if (reg === "geen") echo.push(name.endsWith("klep") ? `geen ${name}insufficiëntie` : `geen insufficiëntie van de ${name}`);
    else if (reg) echo.push(`een ${{ licht: "lichte", matig: "matige", ernstig: "ernstige" }[reg]} insufficiëntie van de ${name}`);
  }
  cv.push(null);
  if (echo.length) {
    const ec = g("echo_comment");
    const tail = ec && ec[0] === ec[0].toLowerCase() && ec[0] !== ec[0].toUpperCase() ? ", " + ec : "";
    cv.push(sent("Echocardiografisch onderzoek toont " + joinNl(echo), tail));
    if (ec && !tail) cv.push(sent(ec));
  }
  if (g("ntprobnp_interp") || g("ntprobnp") !== null)
    cv.push(sent(`Biochemisch${g("lab_date") ? ` (${d.lab_date})` : ""} ${d.ntprobnp_interp || ""} NT-proBNP`.replace(/\s+/g, " "), g("ntprobnp") !== null ? `(${n(d.ntprobnp, 0)} pg/mL)` : ""));
  if (g("swe_septal") !== null) cv.push(`Septale shear wave velocity ${n(d.swe_septal, 1)} m/s.`);

  cv.push(null);
  const cp = [];
  if (D.d_effort_maximal !== undefined) cp.push(`${D.d_effort_maximal ? "Maximale" : "Submaximale"} CPETechoPVP (RER ${n(g("rer_peak"), 2)})`);
  if (g("vo2kg_peak") !== null) {
    let s = `piek VO2 ${n(d.vo2kg_peak)} ml/kg/min`;
    if (D.d_vo2_pct_friend !== undefined) s += ` (${n(D.d_vo2_pct_friend, 0)}% van voorspeld volgens FRIEND)` + (D.d_vo2_reduced ? ", verminderd" : ", behouden");
    cp.push(s);
  }
  if (cp.length) cv.push(sent(cp.join("; ")));
  if (g("pvp_rest") !== null && g("pvp_peak") !== null) {
    let s = `Fontandruk (PVP) ${n(d.pvp_rest)} mmHg in rust en ${n(d.pvp_peak)} mmHg bij piekinspanning`;
    if (D.d_pvp_co_slope !== undefined) s += `, PVP-CO slope ${n(D.d_pvp_co_slope)} mmHg/L/min (${D.d_pvp_slope_high ? "verhoogd" : "normaal"})`;
    if (CONFIG.PVP_AT.confirmed && D.d_pvp_at_x !== undefined)
      s += `, ${n(D.d_pvp_at_x)} mmHg bij ${CONFIG.PVP_AT.value}% van de voorspelde piek-VO2 (${D.d_pvp_at_x_high ? "verhoogd" : "normaal"})`;
    cv.push(sent(s));
  }
  if (g("hr_rest") !== null && g("hr_peak") !== null) cv.push(`Hartfrequentie ${n(d.hr_rest, 0)}/min in rust en ${n(d.hr_peak, 0)}/min bij piekinspanning.`);
  if (D.d_dsvi_pct !== undefined) {
    cv.push(sent(`Het slagvolume ${D.d_dsvi_pct < 0 ? "daalt" : "stijgt"} tijdens inspanning (SVi ${n(D.d_svi_rest, 0)}→${n(D.d_svi_peak, 0)} ml/m², ${D.d_dsvi_pct >= 0 ? "+" : ""}${n(D.d_dsvi_pct, 0)}%)`,
      D.d_preload_limited ? ", suggestief voor preload-limitatie" : ""));
  }
  if (g("sbp_rest") !== null && g("sbp_peak") !== null)
    cv.push(`Bloeddruk ${n(d.sbp_rest, 0)}/${n(g("dbp_rest"), 0)} → ${n(d.sbp_peak, 0)}/${n(g("dbp_peak"), 0)} mmHg.`);
  if (g("valve_comment")) cv.push(sent(d.valve_comment));
  const na = k => String(d[k] || "").toLowerCase().startsWith("niet aanwezig");
  if (na("arrhythmia_ex") && na("repol")) cv.push("Geen inspanningsgeïnduceerde aritmieën of repolarisatiestoornissen.");
  if (g("cv_free")) cv.push(null, sent(d.cv_free));
  section(out, "Cardiovasculair.", cv);

  // pulmonaal
  const pu = [];
  if (g("diaphragm")) pu.push(sent(`Gekend met ${d.diaphragm}`));
  if (g("fev1") !== null) {
    let s = `Spirometrie: FEV1 ${n(d.fev1, 2)} L`;
    if (g("fev1_pct") !== null) s += ` (${n(d.fev1_pct, 0)}% voorspeld)`;
    if (g("fvc") !== null) s += `, FVC ${n(d.fvc, 2)} L`;
    if (g("tiffeneau") !== null) s += `, Tiffeneau-index ${n(d.tiffeneau, 2)}`;
    if (D.d_spiro_pattern === "suggestief restrictief") s += ", suggestief voor een restrictief patroon";
    else if (D.d_spiro_pattern === "obstructief") s += ", obstructief patroon";
    pu.push(sent(s));
  }
  if (D.d_ve_mvv_used !== undefined) pu.push(sent(`${D.d_vent_limited ? "Verminderde" : "Normale"} ademreserve (VE/MVV ${n(D.d_ve_mvv_used, 2)})`));
  if (g("ve_vco2_slope") !== null) pu.push(sent(`VE/VCO2 slope ${n(d.ve_vco2_slope)}`, D.d_vent_class ? `(ventilatoire klasse ${D.d_vent_class})` : ""));
  if (D.d_dspo2 !== undefined) pu.push(sent((D.d_desaturation ? "Desaturatie" : "Geen relevante desaturatie") + ` bij inspanning (${n(d.spo2_rest, 0)}→${n(d.spo2_peak, 0)}%)`));
  if (g("pulm_free")) pu.push(sent(d.pulm_free));
  section(out, "Pulmonaal.", pu);

  // perifeer
  const pe = [];
  const wt = g("weight_kg") ?? g("weight_cpet");
  if (wt !== null)
    pe.push(sent(`Gewicht ${n(wt)} kg`, g("weight_prev") ? `(eerder ${String(d.weight_prev).replace(/\./g, CONFIG.DECIMAL_COMMA ? "," : ".")} kg)` : "",
      D.d_bmi !== undefined ? `, BMI ${n(D.d_bmi)} kg/m²` : "", g("weight_trend") ? `(${d.weight_trend})` : ""));
  if (g("activity")) pe.push(sent(`Fysiek ${d.activity}`));
  if (D.d_extraction_limited !== undefined && !D.d_co_plausibility_warn)
    pe.push(sent(`${D.d_extraction_limited ? "Verminderde" : "Normale"} zuurstofextractie (dCO/dVO2 ${n(g("dco_dvo2"))}; C(a-v)O2 piek ${n(g("cavo2_peak"))} ml/dl)`));
  else if (D.d_co_plausibility_warn) pe.push("Zuurstofextractie niet betrouwbaar te beoordelen (piek-hartdebiet vermoedelijk onderschat).");
  if (g("hb") !== null) pe.push(`Hb ${n(d.hb)} g/dl.`);
  if (D.d_iron_deficiency !== undefined)
    pe.push(sent((D.d_iron_deficiency ? "IJzerdeficiëntie" : "Geen ijzerdeficiëntie") + ` (ferritine ${n(d.ferritin, 0)} µg/L` + (g("tsat") !== null ? `, TSAT ${n(d.tsat, 0)}%)` : ")"),
      g("iron_supp") === "ja" ? "; ijzersuppletie" : ""));
  else pe.push("IJzerstatus niet bepaald.");
  if (g("periph_free")) pe.push(sent(d.periph_free));
  section(out, "Perifeer.", pe);

  // eind-orgaan
  const eo = out.length;
  const li = [];
  const us = (g("us_findings") || []).filter(u => u !== "geen afwijkingen");
  const usWhen = [g("us_date"), g("us_prev_date") ? `vergeleken met ${d.us_prev_date}` : null].filter(Boolean).join(", ");
  if (g("us_conclusion")) li.push(sent(`Echografie lever${usWhen ? ` (${usWhen})` : ""}: ` + d.us_conclusion[0].toLowerCase() + d.us_conclusion.slice(1)));
  else if (g("us_findings")) li.push(sent(`Echografisch${usWhen ? ` (${usWhen})` : ""} ` + (us.length ? joinNl(us) : "geen afwijkingen")));
  if (g("spleen_cm") !== null) li.push(`Milt ${n(d.spleen_cm, Number.isInteger(d.spleen_cm) ? 0 : 1)} cm.`);
  if (g("lsm_kpa") !== null) li.push(sent(`Leverstijfheid ${n(d.lsm_kpa)} kPa`, g("lsm_method") ? `(${d.lsm_method})` : ""));
  const labs = [];
  if (g("platelets") !== null) labs.push(`trombocyten ${n(d.platelets, 0)} ×10⁹/L`);
  const REF = d._ref || {}, ggtHi = REF.ggt && REF.ggt[1] != null ? REF.ggt[1] : 60;
  if (g("ggt") !== null && d.ggt > ggtHi) labs.push(`GGT ${n(d.ggt, 0)} U/L`);
  if (g("bilirubin") !== null && REF.bilirubin && REF.bilirubin[1] != null && d.bilirubin > REF.bilirubin[1]) labs.push(`bilirubine ${n(d.bilirubin, 2)} mg/dL`);
  if (D.d_meld_xi !== undefined) labs.push(`MELD-XI ${n(D.d_meld_xi)}`);
  if (D.d_vast_complete) labs.push(`VAST-score ${D.d_vast}/4`);
  else if (D.d_vast >= 2) labs.push(`VAST-score ≥ ${D.d_vast}/4 (${D._vast_missing} niet gekend)`);
  if (g("fonliver") !== null) labs.push(`FonLiver risk score ${n(d.fonliver)}`);
  if (labs.length) li.push(sent(labs.join(", ")));
  if (g("varices") || g("egd_date")) {
    let s = "Gastroscopie" + (g("egd_date") ? ` (${d.egd_date})` : "");
    if (g("varices") === "geen") s += ": geen varices"; else if (g("varices")) s += `: varices ${d.varices}`;
    li.push(sent(s));
  }
  if (g("egd_note")) li.push(sent(d.egd_note));
  if (g("egd_next")) li.push(`Volgende gastroscopie ${d.egd_next}.`);
  if (g("afp_interp") || g("afp") !== null) li.push(sent(`AFP ${d.afp_interp || ""}`.trim(), g("afp") !== null ? `(${n(d.afp)} µg/L)` : ""));
  if (g("liver_free")) li.push(sent(d.liver_free));
  if (li.length) out.push("* FALD", li.join(" "));

  const ki = [];
  if (D.d_egfr_used !== undefined) {
    const e = D.d_egfr_used, c = T.egfr_categories;
    const q = e >= c[0] ? "Goede" : e >= c[1] ? "Licht verminderde" : e >= c[2] ? "Matig verminderde" : "Ernstig verminderde";
    let alb = "";
    if (D.d_albuminuria) alb = D.d_albuminuria === "A1" ? " zonder albuminurie" : ` met albuminurie (ACR ${n(d.acr, 0)} mg/g)`;
    ki.push(`${q} nierfunctie (eGFR ${n(e, 0)} ml/min/1,73m²)${alb}.`);
  }
  if (g("kidney_free")) ki.push(sent(d.kidney_free));
  if (ki.length) out.push("* Renaal", ki.join(" "));

  const ly = [];
  if (g("ple") === "geen argumenten" && g("plastic_bronchitis") === "geen argumenten") ly.push("Geen argumenten voor PLE/plastische bronchitis.");
  else {
    if (g("ple")) ly.push(`PLE: ${d.ple}.`);
    if (g("plastic_bronchitis")) ly.push(`Plastische bronchitis: ${d.plastic_bronchitis}.`);
  }
  if (g("albumin") !== null) ly.push(`Albumine ${n(d.albumin)} g/L.`);
  const lymLo = REF.lymphocytes && REF.lymphocytes[0] != null ? REF.lymphocytes[0] : 1.0;
  if (g("lymphocytes") !== null && d.lymphocytes < lymLo) ly.push(`Lymfopenie (${n(d.lymphocytes, 2)} ×10⁹/L).`);
  if (g("lymph_imaging")) ly.push(sent(d.lymph_imaging));
  if (g("lymph_free")) ly.push(sent(d.lymph_free));
  if (ly.length) out.push("* Lymfevaten", ly.join(" "));

  const co = [];
  for (const [k, lab] of [["vv_collat", "veno-veneuze collateralen"], ["ap_collat", "aortopulmonale collateralen"]]) {
    const v = g(k);
    if (v === "geen gekend") co.push(`geen gekende ${lab}`); else if (v) co.push(`${lab} ${v}`);
  }
  let cs = co.length ? sent(joinNl(co)) : "";
  if (g("collat_free")) cs = (cs + " " + sent(d.collat_free)).trim();
  if (cs) out.push("* Collateralen", cs);

  const ve = ["venous_text", "venous_free"].filter(k => g(k)).map(k => sent(d[k])).join(" ");
  if (ve) out.push("* Veneus", ve);

  const ot = [];
  if (g("arrhythmia_hx")) ot.push(`Aritmie: ${d.arrhythmia_hx}.`);
  if (g("thrombo_hx")) ot.push(`Trombo-embolie: ${d.thrombo_hx}.`);
  if (g("anticoag")) ot.push(`Antitrombotica: ${d.anticoag}.`);
  if (g("other_free")) ot.push(sent(d.other_free));
  if (ot.length) out.push("* Overige", ot.join(" "));
  if (out.length > eo) { out.splice(eo, 0, "Eind-orgaan functie."); out.push(""); }

  // psychosociaal
  const ps = [];
  if (g("work")) ps.push(sent(`${hij} is ${d.work}`, g("work_text") ? `(${d.work_text})` : ""));
  const PSY = { "geen problemen": "Geen psychische klachten.", "moeilijkheden, geen begeleiding": "Psychische moeilijkheden, (nog) geen begeleiding.",
    "begeleiding lopend": "Psychologische begeleiding lopend.", "begeleiding voorzien": "Psychologische begeleiding voorzien." };
  if (g("psych_wellbeing")) ps.push(PSY[d.psych_wellbeing] || sent(d.psych_wellbeing));
  for (const k of ["social", "reproductive", "psych_free"]) if (g(k)) ps.push(sent(d[k]));
  section(out, "Psychosociaal.", ps);

  // beleid
  const bl = [], nm = g("next_months"), tests = g("next_tests");
  if (nm !== null || tests) {
    const when = nm === 12 ? "Volgend jaar" : nm !== null ? `Over ${n(nm, 0)} maanden` : "Volgende";
    bl.push(sent(`${when} controle`, tests ? `met ${joinNl(tests)}` : ""));
  }
  if (g("plan_free")) bl.push(sent(d.plan_free));
  section(out, "Beleid.", bl);

  let text = out.join("\n");
  while (text.includes("\n\n\n")) text = text.replace("\n\n\n", "\n\n");
  return text.trim();
}

if (typeof module !== "undefined") module.exports = { gradeFrom, polarity, sentencesOf, EXPECTED_SOURCE, CONFIG, FIELDS, FIELD, DOMAINS, DOMAIN_LABEL, ENDORGAN, DERIVED_META, parseReport, compute, buildLetter, searchFields, settingsSummary, HEADINGS };
