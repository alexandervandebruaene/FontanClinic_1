/* ======================================================================
   Office files without libraries: ZIP (store) writer, DOCX + XLSX writers,
   XLSX reader (handles Excel-resaved, deflated files via DecompressionStream).
   ====================================================================== */
const _enc = new TextEncoder();
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zipStore(files) {                       // files: [[name, string|Uint8Array]]
  const parts = [], central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === "string" ? _enc.encode(content) : content;
    const nm = _enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}

const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/* ---------------------------------------------------------------- DOCX */
function letterDocx(text, headings) {
  const rpr = b => `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b ? "<w:b/>" : ""}<w:sz w:val="20"/></w:rPr>`;
  const run = (t, b) => `<w:r>${rpr(b)}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const body = [];
  for (const raw of text.split("\n")) {
    const s = raw.replace(/\s+$/, "");
    if (!s) continue;
    if (headings.includes(s)) body.push(`<w:p><w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr>${run(s, true)}</w:p>`);
    else if (s.startsWith("* ")) body.push(`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="60" w:after="20"/></w:pPr>${run(s.slice(2), true)}</w:p>`);
    else body.push(`<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${run(s, false)}</w:p>`);
  }
  const doc = XML + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const numbering = XML + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const styles = XML + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:lang w:val="nl-BE"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  return zipStore([
    ["[Content_Types].xml", XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`],
    ["_rels/.rels", XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/_rels/document.xml.rels", XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`],
    ["word/document.xml", doc], ["word/styles.xml", styles], ["word/numbering.xml", numbering],
  ]);
}

/* ---------------------------------------------------------------- XLSX writer
   sheets: [{name, rows: [[cell,...],...], widths?:[..], dateCols?: Set(colIndex), boldFirstRow}]
   dates must be passed as 'YYYY-MM-DD' strings in dateCols -> stored as Excel serial with date format */
function colName(i) { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function dateSerial(iso) { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; }

function xlsxBlob(sheets) {
  const sheetXml = sh => {
    const rows = sh.rows.map((r, ri) => {
      const cells = r.map((v, ci) => {
        if (v === null || v === undefined || v === "") return "";
        const ref = colName(ci) + (ri + 1), bold = sh.boldFirstRow && ri === 0 ? ' s="1"' : "";
        if (sh.dateCols && sh.dateCols.has(ci) && ri > 0 && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${ref}" s="2"><v>${dateSerial(v)}</v></c>`;
        if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${bold}><v>${+v.toFixed(6)}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${bold}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
      }).join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join("");
    const cols = sh.widths ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sh.freeze[0]}" ySplit="${sh.freeze[1]}" topLeftCell="${colName(sh.freeze[0])}${sh.freeze[1] + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : "";
    return XML + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const files = [
    ["[Content_Types].xml", XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + `</Types>`],
    ["_rels/.rels", XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", XML + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + `</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", XML + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>` +
      `<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
  ];
  sheets.forEach((s, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]));
  return zipStore(files);
}

/* ---------------------------------------------------------------- XLSX reader */
async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {};
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Geen geldig .xlsx-bestand.");
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
    const data = u8.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
    out[name] = { method, data };
    p += 46 + nlen + xlen + clen;
  }
  return {
    async text(name) {
      const f = out[name]; if (!f) return null;
      if (f.method === 0) return dec.decode(f.data);
      const ds = new DecompressionStream("deflate-raw");
      const ab = await new Response(new Blob([f.data]).stream().pipeThrough(ds)).arrayBuffer();
      return dec.decode(ab);
    }, names: Object.keys(out),
  };
}
const xmlUnesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c)).replace(/&amp;/g, "&");
function colIndex(ref) { const m = ref.match(/^[A-Z]+/)[0]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }

async function readXlsxRows(buf, preferSheet = "visit") {
  const z = await unzip(buf);
  const wb = await z.text("xl/workbook.xml"), rels = await z.text("xl/_rels/workbook.xml.rels");
  const sheets = [...wb.matchAll(/<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)].map(m => ({ name: xmlUnesc(m[1]), rid: m[2] }));
  const target = sheets.find(s => s.name === preferSheet) || sheets[0];
  const relm = [...rels.matchAll(/<Relationship\b[^>]*?Id="([^"]*)"[^>]*?Target="([^"]*)"/g)].concat([...rels.matchAll(/<Relationship\b[^>]*?Target="([^"]*)"[^>]*?Id="([^"]*)"/g)].map(m => [m[0], m[2], m[1]]));
  let tgt = (relm.find(m => m[1] === target.rid) || [])[2] || "worksheets/sheet1.xml";
  tgt = tgt.replace(/^\/?xl\//, "").replace(/^\//, "");
  const xml = await z.text("xl/" + tgt);
  const ssx = await z.text("xl/sharedStrings.xml");
  const shared = ssx ? [...ssx.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlUnesc(t[1])).join("")) : [];
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1]; if (!ref) continue;
      const t = (attrs.match(/\bt="([^"]*)"/) || [])[1];
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      let val = null;
      if (t === "s" && vm) val = shared[+vm[1]];
      else if (t === "inlineStr") val = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => xmlUnesc(x[1])).join("");
      else if (t === "str" && vm) val = xmlUnesc(vm[1]);
      else if (t === "b" && vm) val = vm[1] === "1";
      else if (vm) val = parseFloat(vm[1]);
      row[colIndex(ref)] = val;
    }
    rows.push(row);
  }
  return rows;
}
function serialToIso(v) {
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v;
  const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return dt.toISOString().slice(0, 10);
}

if (typeof module !== "undefined") module.exports = { zipStore, letterDocx, xlsxBlob, readXlsxRows, serialToIso, crc32 };
