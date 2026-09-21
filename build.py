#!/usr/bin/env python3
"""Build the single-file offline app: src/*.js + src/template.html -> dist/fontanclinic.html (no dependencies)."""
from pathlib import Path

ROOT = Path(__file__).parent
PARTS = [("/*__CORE__*/", "core.js"), ("/*__REPORTS__*/", "reports.js"),
         ("/*__OFFICE__*/", "office.js"), ("/*__UI__*/", "ui.js")]

html = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
for marker, name in PARTS:
    assert marker in html, f"marker {marker} missing in template"
    html = html.replace(marker, (ROOT / "src" / name).read_text(encoding="utf-8"))
out = ROOT / "dist" / "fontanclinic.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"built {out.relative_to(ROOT)} ({len(html) // 1024} KB)")
