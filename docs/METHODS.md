# Methods — calculations, thresholds and parsing rules

Everything below is implemented in `src/core.js` (config, fields, CPET parser, calculations, letter) and
`src/reports.js` (consultation, lab and liver-ultrasound parsers, source merging, duplicate checks).
All thresholds live in the `CONFIG` block at the top of `src/core.js`.

## 1. Predicted peak VO2 — FRIEND

de Souza e Silva CG, Kaminsky LA, Arena R, et al. A reference equation for maximal aerobic power for treadmill and
cycle ergometer exercise testing: Analysis from the FRIEND registry. *Eur J Prev Cardiol* 2018;25:742–750.
doi:10.1177/2047487318763958

```
VO2max (ml/kg/min) = 45.2 − 0.35·age − 10.9·sex − 0.15·weight(lb) + 0.68·height(in) − 0.46·mode
sex: male = 1, female = 2        mode: treadmill = 1, cycle ergometer = 2 (used: 2)
```

* Weight: weight at CPET (`weight_cpet`), falling back to the consultation weight. Height: consultation, falling back to CPET.
* % predicted = measured peak VO2 (ml/kg/min) / FRIEND prediction. Reduced if < 80 %.
* The Wasserman and Glaser % predicted values printed by the CPET lab are read in but not used.

## 2. Fontan pressure (PVP)

| Variable | Definition | Abnormal |
|---|---|---|
| PVP rest / low / peak | row labelled `RAP`, `Fontan`, `PVP` or `Fontandruk` in the exercise-echo table | — |
| PVP–CO slope | (PVP peak − PVP rest) / (CO peak − CO rest) | > 3 mmHg/L/min |
| PVP@33 | PVP linearly interpolated at a VO2 equal to 33 % of the FRIEND-predicted peak VO2 (absolute, ml/min = prediction × CPET weight), between the measured rest/low/peak VO2 points | > 19.2 mmHg |

If the target VO2 lies outside the measured range, PVP@33 is reported as not computable (no extrapolation).
The lab's own mPAP/CO slope is shown alongside; a difference > 0.3 is flagged.

## 3. Other CPET / exercise-echo variables

| Variable | Rule |
|---|---|
| Effort | maximal if peak RER > 1.05; otherwise "submaximal — interpretation with caution" |
| Heart rate | rest and peak reported only (no chronotropic classification) |
| ΔSVi | SVi = SV / BSA (CPET BSA); preload limitation if ΔSVi rest→peak ≤ −10 % |
| Desaturation | SpO2 rest − peak ≥ 5 %-points |
| Ventilatory reserve | VE/MVV (MVV = 40 × FEV1 if not reported); limitation if > 0.80 |
| Ventilatory class | VE/VCO2 slope: I < 30, II 30–35.9, III 36–44.9, IV ≥ 45 |
| Spirometry | obstructive if FEV1/FVC < 0.70; "suggestive of restriction" if FEV1/FVC ≥ 0.70 and FEV1 < 80 % predicted |
| O2 extraction | reduced if dCO/dVO2 > 7 or peak C(a−v)O2 < 14 ml/dl |
| Plausibility | warning (extraction not interpretable) if mixed venous saturation < 20 % or peak C(a−v)O2 > 90 % of expected CaO2 (1.34 · Hb · SpO2 peak) |
| Two-value rows | exercise-echo rows with only two values (e.g. `MV E vel`) are assigned to rest + peak |

## 4. Laboratory, liver, kidney

| Variable | Rule |
|---|---|
| NT-proBNP, AFP, GGT, lymphocytes, albumin | interpreted against the reference range printed on the pasted lab report; fallbacks: GGT ≤ 60 U/L, AFP ≤ 10 µg/L, lymphocytes ≥ 1.0 ×10⁹/L, albumin ≥ 35 g/L |
| Iron deficiency | ferritin < 100 µg/L, or 100–299 µg/L with TSAT < 20 % |
| eGFR | lab value; if absent, CKD-EPI 2021 (creatinine in mg/dL, age, sex) |
| Albuminuria | ACR (mg/g) A1 < 30, A2 30–300, A3 > 300; mg/mmol converted ×8.84 |
| MELD-XI | 5.11·ln(bilirubin mg/dL) + 11.76·ln(creatinine mg/dL) + 9.44, values < 1 set to 1 |
| VAST | 1 point each: varices, ascites, splenomegaly, platelets < 150 ×10⁹/L; reported as "≥ n/4" with the missing components named when incomplete |
| APRI / FIB-4 | computed for information only (poor accuracy in FALD) |
| FonLiver | manual entry (scoring table not implemented) |

References still to be added for: CKD-EPI 2021, MELD-XI, VAST, the ESC iron-deficiency definition, the ventilatory
classes, APRI/FIB-4 and FONLIVER.

## 5. Report parsing

| Paste field | Recognised by | Extracts |
|---|---|---|
| CPETechoPVP | `Inspanningsecho`, `CPET:` | ~100 CPET and exercise-echo variables, lab conclusion |
| Consultation (KWS) | section headers followed by a dashed line (`DIAGNOSE - ANTECEDENTEN`, `HUIDIGE BEHANDELING`, `REDEN VAN CONSULTATIE`, `KLINISCH ONDERZOEK`, `ELECTROCARDIOGRAM`, `ECHOCARDIOGRAFIE`) | diagnosis & Fontan details (suggestions), history fragments (diaphragm, venous, thrombo-embolic, arrhythmia), medication & antithrombotics, symptoms with negation handling, NYHA, smoking, sport, work, psychology, sex (from pronouns), vitals, ECG, echo (ventricular function, EF, AV-valve and neo-aortic regurgitation, connections) |
| Lab | `Hematologie`, `Chemie Bloed`, `Stolling`, … | mapped analytes + reference ranges; all `*`-flagged results listed on the overview |
| Liver ultrasound | `RELEVANTE KLINISCHE INLICHTINGEN`, `Echografie van de lever` | findings, spleen size, conclusion, comparison date, liver stiffness (kPa) and method |

* A paste field containing several report types is split automatically and each part is read by its own parser.
* Re-pasting (or emptying) a field replaces everything that field produced before.
* Values marked orange are *suggestions* built by the tool (e.g. the diagnosis sentence), not literal report values.
* Negation: a finding counts as absent if `geen`, `niet`, `zonder` or `nooit` precedes it in the same sentence,
  unless reset by `maar`, `wel`, `echter`.
* Echo: the echo conclusion (`BESLUIT`) takes precedence over the valve sections for the neo-aortic valve; a
  disagreement is reported.

## 6. Source priority and duplicate checks

When more than one source provides a value: **manual entry > previous-visit file > source priority > first source**.

| Field | Priority |
|---|---|
| Hb | lab > CPET |
| medication | consultation > CPET |
| height | consultation > CPET |
| ventricular function, connections, neo-aortic regurgitation | consultation (echo) > CPET conclusion |
| weight | not merged — consultation (`weight_kg`) and CPET (`weight_cpet`) are separate fields |

Disagreements are listed under **Bronnen & dubbels** on the overview, together with: weight CPET vs consultation
(> 3 kg), resting saturation CPET vs consultation (≥ 3 %-points), the same topic appearing in more than one free-text
field used by the letter, and any four-word phrase shared between two such fields.

A new EAD number (or loading a previous-visit file of another patient) clears all other fields after confirmation.
