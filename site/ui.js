import { collect } from "../lib/sources.js";
import { dateText, displayRow, excel, headers, statusHeaders } from "../lib/excel.js";

const collectButton = document.querySelector("#collect");
const download = document.querySelector("#download");
const message = document.querySelector("#message");
const source = document.querySelector("#source");
const stat = document.querySelector("#stat");
const number = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let report;
let downloadUrl;
function table(target, columns, rows) {
  const element = document.querySelector(target);
  element.replaceChildren();
  const head = element.createTHead().insertRow();
  for (const value of columns) {
    const cell = document.createElement("th");
    cell.textContent = value;
    cell.scope = "col";
    head.append(cell);
  }
  const body = element.createTBody();
  for (const data of rows) {
    const row = body.insertRow();
    for (const value of data) row.insertCell().textContent = value;
  }
}
function renderRows() {
  const rows = (report?.rows || []).filter((r) =>
    (!source.value || r[5] === source.value) && (!stat.value || r[7] === stat.value));
  table("#preview", headers, rows.map((r) => [
    r[0], r[1].toLocaleString("ru-RU"), number.format(r[2]), number.format(r[3]), r[4], r[5], r[6], r[7],
  ]));
  document.querySelector("#count").textContent = rows.length
    ? "Строк в таблице: " + rows.length
    : report ? "По выбранным фильтрам строк нет." : "";
}
function show(result, manual = false) {
  report = result && { ...result, rows: result.rows.map((row) => row.length === 7 ? [...row, "Очки"] : row) };
  download.hidden = !result;
  const problems = result?.status.filter((s) => s[2].startsWith("Ошибка")).length || 0;
  message.textContent = result
    ? (manual ? "Ручной отчёт от " : "Отчёт от ") + result.startedLabel + " (Екатеринбург) · строк: " + result.rows.length +
      (problems ? " · ошибок: " + problems + ". Подробности в статусах по матчам." : "")
    : "Первый отчёт ещё не опубликован.";
  table("#statuses", result?.statusHeaders || [], result?.status || []);
  if (result?.ownerLink) {
    const manual = document.querySelector("#manual");
    manual.href = result.ownerLink;
    manual.hidden = false;
  }
  renderRows();
}
async function get(url, options) {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Запрос завершился ошибкой.");
  return value;
}
source.addEventListener("change", renderRows);
stat.addEventListener("change", renderRows);
const initialLoad = new AbortController();
const initialTimeout = setTimeout(() => initialLoad.abort(), 8000);
get("./report.json", { cache: "no-cache", signal: initialLoad.signal })
  .then((result) => show(result))
  .catch(() => { message.textContent = "Последний отчёт не загрузился. Можно запустить сбор вручную."; })
  .finally(() => { clearTimeout(initialTimeout); collectButton.disabled = false; });

collectButton.addEventListener("click", async () => {
  collectButton.disabled = true;
  collectButton.textContent = "Собираю данные…";
  message.textContent = "Загружаю актуальные линии FONBET и БЕТСИТИ…";
  try {
    const result = await collect();
    if (result.status.every((row) => row[2].startsWith("Ошибка"))) {
      table("#statuses", statusHeaders, result.status);
      message.textContent = "Новый сбор не удался. Подробности в статусах по матчам.";
      return;
    }
    const file = new Blob([excel(result)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(file);
    download.href = downloadUrl;
    download.download = "NBA_totals_manual_" + result.startedAt.slice(0, 19).replaceAll(":", "-") + ".xlsx";
    show({ ...result, startedLabel: dateText(result.startedAt), rows: result.rows.map(displayRow), statusHeaders }, true);
  } catch {
    message.textContent = "Не удалось создать новый отчёт. Попробуйте ещё раз.";
  } finally {
    collectButton.disabled = false;
    collectButton.textContent = "Собрать данные сейчас";
  }
});
