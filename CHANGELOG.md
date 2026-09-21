# Changelog

## 0.3.0 — 2026-09-21
* Four paste fields (CPETechoPVP, KWS consultation, lab, liver ultrasound) with automatic splitting of combined exports.
* Source priority and conflict reporting ("Bronnen & dubbels"); duplicate-text check for the letter.
* Predicted peak VO2 by FRIEND (cycle); PVP@33 at 33 % of FRIEND-predicted peak VO2.
* Heart rate reported at rest and peak only; two-value exercise-echo rows assigned to rest + peak.
* New EAD number clears all other fields; re-pasting a field replaces its previous values.
* Fix: KWS section headers ending in a colon (e.g. `HUIDIGE BEHANDELING:`) were not recognised.

## 0.2.0
* Single-file offline HTML version; Word and Excel generated in the browser without libraries.

## 0.1.0
* Prototype (Python/Streamlit), not included in this repository.

---
**Open item:** choose a license before making the repository public (e.g. MIT for maximum reuse, or GPL-3.0 to keep
derivatives open). Without a license file, others may view but not legally reuse the code.
