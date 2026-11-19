import { evHeaders, listOutcomes, scoreCells, scoreOutcome, scoreSaved } from "../lib/ev.js";

const storeKey = "nba-totals-ev-v1";
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const percent = (value) => (value > 0 ? "+" : "") + fmt.format(value) + "%";
const readNumber = (value) => value.trim() ? Number(value.trim().replace(",", ".")) : NaN;

function loadEdits() {
  try {
    const entries = new Map(JSON.parse(localStorage.getItem(storeKey) || "[]"));
    for (const [key, entry] of entries) {
      try { scoreOutcome(entry.odds ?? 2, entry.win, entry.push); }
      catch { entries.delete(key); }
    }
    return entries;
  } catch { return new Map(); }
}

export function createEvPanel(table) {
  const form = document.querySelector("#ev-form");
  const choose = document.querySelector("#ev-line");
  const find = document.querySelector("#ev-search");
  const group = document.querySelector("#ev-group");
  const match = document.querySelector("#ev-match");
  const odds = document.querySelector("#ev-odds");
  const win = document.querySelector("#ev-win");
  const push = document.querySelector("#ev-push");
  const pushField = document.querySelector("#ev-push-field");
  const note = document.querySelector("#ev-note");
  const positive = document.querySelector("#ev-positive");
  const pool = document.querySelector("#ev-summary");
  const save = document.querySelector("#ev-save");
  const remove = document.querySelector("#ev-remove");
  const edits = loadEdits();
  let outcomes = [];
  let byKey = new Map();

  function persist() {
    try { localStorage.setItem(storeKey, JSON.stringify([...edits])); }
    catch { note.textContent += " Браузер не сохранил данные после закрытия вкладки."; }
  }

  function evaluated() {
    return scoreSaved(outcomes, edits);
  }

  function renderScores() {
    const scored = evaluated();
    const qualified = scored.filter((row) => row.stake != null);
    const visible = positive.checked ? qualified : scored;
    table("#ev-table", [...evHeaders, "Правка"], visible.map((row) => {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Изменить";
      edit.addEventListener("click", () => {
        find.value = "";
        group.value = "";
        match.value = row.match;
        renderChoices();
        choose.value = row.key;
        selectOutcome();
        odds.focus();
      });
      const cells = scoreCells(row).map((value, i) => {
        if (value == null) return "—";
        if (i === 8) return percent(value);
        if (i >= 4 && i <= 12) return fmt.format(value);
        return value;
      });
      return [...cells, edit];
    }));
    const sum = qualified.reduce((acc, row) => acc + row.stake, 0);
    pool.textContent = scored.length
      ? `Оценено исходов: ${scored.length}. Выше +18%: ${qualified.length}. Сумма номиналов: ${fmt.format(sum)} ₽.`
      : "Выберите исход и введите свою оценку вероятности.";
  }

  function renderEstimate() {
    const current = byKey.get(choose.value);
    save.disabled = true;
    if (!current) { note.textContent = ""; return null; }
    if (!win.value.trim() || (current.canPush && !push.value.trim())) {
      note.textContent = current.canPush ? "Укажите вероятность прохода и вероятность возврата. Если возврат исключён, введите 0%." : "Введите оценку вероятности прохода.";
      return null;
    }
    try {
      const entry = { win: readNumber(win.value), push: current.canPush ? readNumber(push.value) : 0 };
      const coeff = readNumber(odds.value);
      const score = scoreOutcome(coeff, entry.win, entry.push);
      if (coeff !== current.odds) entry.odds = coeff;
      save.disabled = false;
      note.textContent = `EV ${percent(score.ev)}. ` + (score.stake == null ? "Ниже или на пороге +18%." : `Номинал ${fmt.format(score.stake)} ₽.`);
      return entry;
    } catch (error) {
      note.textContent = error.message;
      return null;
    }
  }

  function selectOutcome() {
    const current = byKey.get(choose.value);
    const entry = edits.get(choose.value);
    odds.value = current ? entry?.odds ?? current.odds : "";
    win.value = entry?.win ?? "";
    push.value = entry?.push ?? "";
    pushField.hidden = !current?.canPush;
    odds.disabled = win.disabled = !current;
    remove.hidden = !entry;
    renderEstimate();
  }

  function renderChoices() {
    const previous = choose.value;
    const search = find.value.trim().toLowerCase();
    const matches = outcomes.filter((row) =>
      (!match.value || row.match === match.value) &&
      (!group.value || (row.market === "Тотал игрока") === (group.value === "player")) &&
      `${row.match} ${row.source} ${row.stat} ${row.market} ${row.label}`.toLowerCase().includes(search));
    choose.replaceChildren(new Option(matches.length ? "Выберите исход" : "Исходы не найдены", ""));
    for (const row of matches) {
      choose.append(new Option(`${row.source} · ${row.match} · ${row.stat} · ${row.label} · ${fmt.format(row.odds)}`, row.key));
    }
    if (matches.some((row) => row.key === previous)) choose.value = previous;
    selectOutcome();
  }

  find.addEventListener("input", renderChoices);
  group.addEventListener("change", renderChoices);
  match.addEventListener("change", renderChoices);
  choose.addEventListener("change", selectOutcome);
  for (const field of [odds, win, push]) field.addEventListener("input", renderEstimate);
  positive.addEventListener("change", renderScores);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = renderEstimate();
    if (!entry) return;
    edits.set(choose.value, entry);
    remove.hidden = false;
    persist();
    renderScores();
  });
  remove.addEventListener("click", () => {
    edits.delete(choose.value);
    selectOutcome();
    persist();
    renderScores();
  });

  return {
    setReport(report) {
      outcomes = listOutcomes(report?.rows || [], report?.teamRows || []);
      byKey = new Map(outcomes.map((row) => [row.key, row]));
      const previousMatch = match.value;
      const matches = [...new Set(outcomes.map((row) => row.match))];
      match.replaceChildren(new Option("Все матчи", ""), ...matches.map((name) => new Option(name, name)));
      if (matches.includes(previousMatch)) match.value = previousMatch;
      renderChoices();
      renderScores();
    },
    exportRows: () => evaluated().map(scoreCells),
  };
}
