import { strToU8, zipSync } from "fflate";
import { evHeaders, outcomeLabel } from "./ev.js";

export const headers = ["Игрок", "Тотал", "Коэффициент «Больше»", "Коэффициент «Меньше»",
  "Матч", "Букмекер", "Начало матча", "Показатель"];
export const teamHeaders = ["Матч", "Показатель", "Рынок", "Исход 1", "Коэффициент 1", "Исход 2",
  "Коэффициент 2", "Букмекер", "Начало матча"];
export const statusHeaders = ["Букмекер", "Матч", "Статус", "Строк", "Подробности"];
export const timeZone = "Asia/Yekaterinburg";
const time = new Intl.DateTimeFormat("ru-RU", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
export const dateText = (iso) => time.format(new Date(iso));
export const displayRow = (row) => [...row.slice(0, 6), dateText(row[6]), ...row.slice(7)];
export const teamCells = (row) => [row[4], row[7], row[8], outcomeLabel(row, 0), row[2],
  outcomeLabel(row, 1), row[3], row[5], row[6]];
const xml = (s) => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
  .replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]));
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const pkg = "http://schemas.openxmlformats.org/package/2006";
const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function sheet(columns, rows, widths, decimals = []) {
  const cells = [columns, ...rows].map((row, index) => {
    const number = index + 1;
    return '<row r="' + number + '">' + row.map((value, i) => {
      const key = String.fromCharCode(65 + i) + number;
      const style = number === 1 ? ' s="1"' : decimals.includes(i) ? ' s="2"' : "";
      if (value == null) return '<c r="' + key + '"/>';
      if (typeof value === "number" && Number.isFinite(value)) return '<c r="' + key + '"' + style + '><v>' + value + '</v></c>';
      return '<c r="' + key + '"' + (number === 1 ? style : "") + ' t="inlineStr"><is><t xml:space="preserve">' +
        xml(value ?? "") + "</t></is></c>";
    }).join("") + "</row>";
  }).join("");
  return decl + '<worksheet xmlns="' + ns + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
    widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") +
    "</cols><sheetData>" + cells + '</sheetData><autoFilter ref="A1:' + String.fromCharCode(64 + columns.length) + (rows.length + 1) + '"/></worksheet>';
}

export function excel(report, { formatted = false, assessments = [] } = {}) {
  const display = formatted ? (row) => row : displayRow;
  const sheets = [
    ["Тоталы игроков", headers, report.rows.map(display), [30, 16, 25, 25, 49, 14, 24, 27], [2, 3]],
    ["Командные линии", teamHeaders, (report.teamRows || []).map((row) => teamCells(display(row))),
      [49, 26, 21, 39, 18, 39, 18, 14, 24], [4, 6]],
    ["EV", evHeaders, assessments, [49, 26, 39, 14, 16, 23, 23, 25, 15, 29, 17, 26, 26, 16], [4, 5, 6, 7, 8, 9, 11, 12]],
    ["Статус сбора", statusHeaders, report.status, [15, 50, 22, 10, 60], []],
  ];
  const sheetOverrides = sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
    '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("");
  const workbookSheets = sheets.map(([name], i) => '<sheet name="' + xml(name) +
    '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("");
  const workbookRels = sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' +
    rel + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("");
  const entries = {
    "[Content_Types].xml": '<Types xmlns="' + pkg + '/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheetOverrides + '</Types>',
    "_rels/.rels": '<Relationships xmlns="' + pkg + '/relationships"><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="' + ns + '" xmlns:r="' + rel + '"><sheets>' + workbookSheets + '</sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="' + pkg + '/relationships">' + workbookRels + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<styleSheet xmlns="' + ns + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF18394D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  };
  const files = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(decl + v)]));
  for (const [i, [, columns, rows, widths, decimals]] of sheets.entries()) {
    files["xl/worksheets/sheet" + (i + 1) + ".xml"] = strToU8(sheet(columns, rows, widths, decimals));
  }
  return zipSync(files, { level: 5 });
}
