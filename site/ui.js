const download = document.querySelector("#download");
const message = document.querySelector("#message");
const source = document.querySelector("#source");
const number = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let report;
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
  const rows = (report?.rows || []).filter((r) => !source.value || r[5] === source.value);
  table("#preview", report?.headers || [], rows.map((r) => [
    r[0], r[1].toLocaleString("ru-RU"), number.format(r[2]), number.format(r[3]), r[4], r[5], r[6],
  ]));
  document.querySelector("#count").textContent = rows.length
    ? "Строк в таблице: " + rows.length
    : report ? "По выбранному источнику строк нет." : "";
}
function show(result) {
  report = result;
  download.hidden = !result;
  const problems = result?.status.filter((s) => s[2].startsWith("Ошибка")).length || 0;
  message.textContent = result
    ? "Отчёт от " + result.startedLabel + " (Екатеринбург) · строк: " + result.rows.length +
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
get("./report.json", { cache: "no-cache" }).then(show)
  .catch(() => { message.textContent = "Отчёт не загрузился. Обновите страницу чуть позже."; });
