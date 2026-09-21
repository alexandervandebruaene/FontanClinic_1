# FontanClinic — outpatient visit dashboard

A single-file, offline web app for the adult Fontan outpatient clinic (Division of Congenital and Structural
Cardiology, University Hospitals Leuven). Paste the source reports, review the structured data, and get:

1. a structured **Dutch letter conclusion** (copy to the EHR, or download as Word), and
2. a **one-row Excel file per visit** (keyed on EAD number + visit date) with a codebook, ready for pooling into a research dataset.

The letter follows the clinic's physiological layout:
**Cardiovasculair → Pulmonaal → Perifeer → Eind-orgaan functie** (lever/FALD, nier, lymfatisch, collateralen,
veneus, overige) **→ Psychosociaal → Beleid**.

> ⚠️ **Not a medical device.** This is a documentation and research-support tool. It is not CE-marked under the EU
> MDR. Every value, interpretation and letter sentence must be checked by the treating physician.

## Quick start

1. Download [`dist/fontanclinic.html`](dist/fontanclinic.html).
2. Open it in Edge or Chrome (double-click). Nothing to install; works offline.
3. Enter EAD number and visit date, then paste the reports into the four fields:
   **CPETechoPVP · Raadpleging (KWS) · Labo · Echo lever** — they are read in immediately.
   Pasting a complete KWS export into one field also works; it is split automatically.
4. Check the **Overzicht** tab (traffic lights per domain, source conflicts, out-of-range lab values),
   complete what is missing via the tabs or the search bar (`Ctrl K`).
5. **Brief & export**: copy the letter to KWS, download Word, download the Excel row.

Optional: load last visit's Excel file ("Vorig bezoek laden") to carry over anatomy, history and surveillance planning.
Pool visit files for analysis under **Instellingen & bundelen**.

Field markers: 🟢 read from a report · 🟠 suggestion built by the tool, please confirm · 🔵 carried over from the previous visit.
Hovering over a marker shows the source.

## Privacy

* All processing happens in the browser tab. No data is sent anywhere; the file loads no external resources.
* Data disappears when the tab is closed — the Excel export is the record.
* **Never commit patient data to this repository.** `.gitignore` blocks `*.xlsx`, `*.docx`, `*.csv` and the folders
  `private/`, `data/`, `exports/`, `real_reports/`. The test reports in `tests/fixtures/` are entirely fictional.

## Methods

Formulas, thresholds, parsing rules and source priorities are documented in [`docs/METHODS.md`](docs/METHODS.md).
Key conventions:

* predicted peak VO2 by the **FRIEND** equation (cycle ergometer);
* **PVP@33** = Fontan pressure interpolated at 33 % of the FRIEND-predicted peak VO2 (abnormal > 19.2 mmHg);
* PVP–CO slope abnormal > 3 mmHg/L/min; preload limitation if ΔSVi ≤ −10 %; desaturation if SpO2 falls ≥ 5 %-points;
* heart rate reported at rest and peak only;
* FonLiver score entered manually.

## Repository layout

```
dist/fontanclinic.html     built app — the only file users need
src/template.html          HTML + CSS shell
src/core.js                config, field registry, CPETechoPVP parser, calculations, letter builder
src/reports.js             consultation / lab / liver-ultrasound parsers, source merging, duplicate checks
src/office.js              dependency-free ZIP, DOCX and XLSX writer + XLSX reader
src/ui.js                  interface
build.py                   concatenates src/ into dist/fontanclinic.html (Python 3, no dependencies)
tests/run_tests.js         unit tests (Node ≥ 18, no dependencies)
tests/browser_test.py      optional end-to-end test (Playwright)
tests/fixtures/            fictional reports in the UZ Leuven formats
docs/METHODS.md            methods documentation
```

## Development

```bash
python build.py                 # rebuild dist/ after editing src/
node tests/run_tests.js         # unit tests
python tests/browser_test.py    # optional: pip install playwright && playwright install chromium
```

GitHub Actions runs the unit tests on every push and fails if `dist/` was not rebuilt after a change in `src/`.

Common changes:

* **thresholds / conventions** → `CONFIG` at the top of `src/core.js`
* **a new field** → one `add(...)` line in `src/core.js`; it appears automatically in the UI, the search, the Excel export and the codebook
* **letter wording** → `buildLetter()` in `src/core.js`
* **a new label in a report** → `ROW_MAP` / `KV_NUM` (CPET) in `src/core.js`, or the relevant parser in `src/reports.js`

## Snel starten (NL)

Download `dist/fontanclinic.html`, open in Edge of Chrome, vul EAD en datum in, plak de verslagen in de vier vakken,
controleer het overzicht, en kopieer of download de brief en de Excel-rij. Alles blijft lokaal in de browser.

## Maintainer

Alexander Van De Bruaene — Division of Congenital and Structural Cardiology, University Hospitals Leuven /
Department of Cardiovascular Sciences, KU Leuven. ORCID [0000-0002-0469-8640](https://orcid.org/0000-0002-0469-8640)

## License

To be decided — see the note in `CHANGELOG.md`.
