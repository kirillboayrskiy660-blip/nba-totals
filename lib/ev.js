export const evHeaders = [
  "Матч", "Показатель", "Исход", "Букмекер", "Коэффициент", "Вероятность прохода, %",
  "Вероятность возврата, %", "Порог безубыточности, %", "EV, %", "Мин. коэффициент для EV > +18%",
  "Номинал, ₽", "Выплата при выигрыше, ₽", "Прибыль при выигрыше, ₽", "Фильтр",
];

const rounded = (value, scale = 1e10) => Math.round(value * scale) / scale;
const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const signed = (n) => (n > 0 ? "+" : "") + format.format(n);

export function scoreOutcome(odds, win, push = 0) {
  if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(win) ||
      !Number.isFinite(push) || win < 0 || push < 0 || win + push > 100) {
    throw new RangeError("Проверьте коэффициент и вероятности. Сумма вероятностей должна быть не выше 100%.");
  }
  const ev = rounded(win * odds + push - 100);
  const minimumOdds = win > 0 ? Math.max(101, Math.floor(rounded(100 * (118 - push) / win)) + 1) / 100 : null;
  const stake = ev > 18 ? Math.round(200 + 25.8199 * Math.sqrt(Math.max(0, ev - 20))) : null;
  const payout = stake == null ? null : rounded(stake * odds, 100);
  return {
    ev, minimumOdds, stake, payout,
    breakEven: (100 - push) / odds,
    profit: payout == null ? null : rounded(payout - stake, 100),
  };
}

export function outcomeLabel(row, side) {
  const [subject, line, , , match, , , , market] = row;
  if (market === "Фора") {
    const team = match.split(" — ")[side];
    return `Ф${side + 1} ${signed(side === 0 ? line : -line)}${team ? " · " + team : ""}`;
  }
  const prefix = market === "Тотал команды" ? "ИТ" : "Т";
  const direction = side === 0 ? "Б" : "М";
  return `${prefix}${direction} ${format.format(line)}${market === "Общий тотал" ? "" : " · " + subject}`;
}

export function listOutcomes(players, teams) {
  return [...players, ...teams].flatMap((row) => [0, 1].map((side) => ({
    key: JSON.stringify([row[4], row[5], row[6], row[7], row[8] ?? "Тотал игрока", row[0], row[1], side]),
    match: row[4],
    source: row[5],
    stat: row[7],
    market: row[8] ?? "Тотал игрока",
    subject: row[0],
    label: outcomeLabel(row, side),
    odds: row[2 + side],
    canPush: Number.isInteger(row[1]),
  })));
}

export function scoreSaved(outcomes, edits) {
  return outcomes.filter((outcome) => edits.has(outcome.key)).map((outcome) => {
    const entry = edits.get(outcome.key);
    const odds = entry.odds ?? outcome.odds;
    return { ...outcome, ...entry, odds, ...scoreOutcome(odds, entry.win, entry.push) };
  }).sort((a, b) => b.ev - a.ev || a.label.localeCompare(b.label, "ru"));
}

export function scoreCells(outcome) {
  return [outcome.match, outcome.stat, outcome.label, outcome.source, outcome.odds,
    outcome.win, outcome.push, rounded(outcome.breakEven, 100), outcome.ev, outcome.minimumOdds,
    outcome.stake, outcome.payout, outcome.profit, outcome.stake == null ? "Не проходит" : "Проходит"];
}
