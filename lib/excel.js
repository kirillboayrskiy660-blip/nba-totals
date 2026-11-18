import { strToU8, zipSync } from "fflate";

export const headers = ["Игрок", "Тотал очков", "Коэффициент «Больше»", "Коэффициент «Меньше»",
  "Матч", "Букмекер", "Начало матча"];
export const statusHeaders = ["Букмекер", "Матч", "Статус", "Строк", "Подробности"];
export const timeZone = "Asia/Yekaterinburg";
const time = new Intl.DateTimeFormat("ru-RU", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
export const dateText = (iso) => time.format(new Date(iso));
const xml = (s) => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
  .replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]));
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const pkg = "http://schemas.openxmlformats.org/package/2006";
const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function sheet(columns, rows, widths) {
  const cells = [columns, ...rows].map((row, index) => {
    const number = index + 1;
    return '<row r="' + number + '">' + row.map((value, i) => {
      const key = String.fromCharCode(65 + i) + number;
      const style = number === 1 ? ' s="1"' : i === 2 || i === 3 ? ' s="2"' : "";
      if (typeof value === "number" && Number.isFinite(value)) return '<c r="' + key + '"' + style + '><v>' + value + '</v></c>';
      return '<c r="' + key + '"' + (number === 1 ? style : "") + ' t="inlineStr"><is><t xml:space="preserve">' +
        xml(value ?? "") + "</t></is></c>";
    }).join("") + "</row>";
  }).join("");
  return decl + '<worksheet xmlns="' + ns + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
    widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") +
    "</cols><sheetData>" + cells + '</sheetData><autoFilter ref="A1:' + String.fromCharCode(64 + columns.length) + (rows.length + 1) + '"/></worksheet>';
}

export function excel(report) {
  const entries = {
    "[Content_Types].xml": '<Types xmlns="' + pkg + '/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="' + pkg + '/relationships"><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="' + ns + '" xmlns:r="' + rel + '"><sheets><sheet name="Тоталы игроков" sheetId="1" r:id="rId1"/><sheet name="Статус сбора" sheetId="2" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="' + pkg + '/relationships"><Relationship Id="rId1" Type="' + rel + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + rel + '/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<styleSheet xmlns="' + ns + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF18394D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  };
  const files = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(decl + v)]));
  files["xl/worksheets/sheet1.xml"] = strToU8(sheet(headers,
    report.rows.map((row) => [...row.slice(0, 6), dateText(row[6])]),
    [30, 16, 25, 25, 49, 14, 24]));
  files["xl/worksheets/sheet2.xml"] = strToU8(sheet(statusHeaders, report.status, [15, 50, 22, 10, 60]));
  return zipSync(files, { level: 5 });
}
