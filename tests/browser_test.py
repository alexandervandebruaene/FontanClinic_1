"""Optional end-to-end test in a real (headless) browser.
    pip install playwright && playwright install chromium
    python tests/browser_test.py
Uses dist/fontanclinic.html and the fictional fixtures only."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / "dist" / "fontanclinic.html").as_uri()
FX = ROOT / "tests" / "fixtures"
cpet = (FX / "cpet_synthetic.txt").read_text(encoding="utf-8")
kws = (FX / "kws_synthetic.txt").read_text(encoding="utf-8")

errors, ok = [], True
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1366, "height": 900}, accept_downloads=True)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(APP)
    pg.fill("#hdrEad", "000000"); pg.press("#hdrEad", "Tab"); pg.fill("#hdrDate", "2026-03-10")
    pg.fill("#paste_cpet", cpet); pg.fill("#paste_consult", kws); pg.wait_for_timeout(800)
    pg.click("[data-tab=header]"); pg.fill("#f_age", "30")
    counts = pg.evaluate("state.counts")
    pg.click("[data-tab=letter]"); letter = pg.input_value("#letterText")
    with pg.expect_download() as dl: pg.click("#btnXlsx")
    name = dl.value.suggested_filename
    pg.fill("#paste_cpet", ""); pg.wait_for_timeout(600)
    cleared = pg.evaluate("state.data.pvp_peak === undefined")
    pg.fill("#hdrEad", "111111"); pg.press("#hdrEad", "Tab"); pg.wait_for_timeout(300)
    reset = pg.evaluate("Object.keys(state.data).filter(k => !k.startsWith('_')).sort().join(',')")
    b.close()

checks = {
    "all four sources read": set(counts) == {"cpet", "consult", "lab", "liver"},
    "letter uses FRIEND": "volgens FRIEND" in letter,
    "excel file name": name == "000000_20260310.xlsx",
    "emptying a paste field removes its values": cleared,
    "new EAD clears everything else": reset == "ead,visit_date",
    "no console errors": not errors,
}
for k, v in checks.items():
    print(("  ✓ " if v else "  ✗ ") + k)
    ok &= v
if errors: print(errors)
raise SystemExit(0 if ok else 1)
