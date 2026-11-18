const FONBET = "https://line01w.bk6bba-resources.com";
const BETCITY = "https://ad.betcity.ru/d";

async function feed(base, route, params) {
  const url = base + route + "?" + new URLSearchParams(params);
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" }, signal: controller.signal,
        redirect: "manual",
      });
    } catch (error) {
      if (attempt === 1) {
        console.warn(new URL(url).hostname + " " + error.name + ": " + error.message);
        throw new Error("Источник не ответил на запрос");
      }
      continue;
    } finally {
      clearTimeout(timeout);
    }
    if (![502, 503, 504].includes(response.status) || attempt === 1) break;
    await response.body?.cancel();
  }
  if (!response.ok) throw new Error("Источник ответил HTTP " + response.status);
  try { return await response.json(); }
  catch { throw new Error("Источник вернул ответ в неожиданном формате"); }
}

const list = (object) => Object.values(object || {});
const validNumber = (value) => value != null && value !== "" && Number.isFinite(Number(value));
const points = (value) => validNumber(value) && Number(value) >= 0;
const odds = (value) => validNumber(value) && Number(value) > 1;
const nba = /^(NBA|НБА)(?:\s|\.|$)/i;
const enMatchLeague = /^(NBA|НБА)(?:[.\s]+(?:regular season|play-?offs?|preseason|play-?in|cup|finals|регулярный сезон|плей-?офф|предсезонные матчи|плей-?ин|кубок|финал))?[.\s]*$/i;

function makeMatch(id, match, date) {
  if (!validNumber(date) || Number(date) <= 0) throw new Error("В линии отсутствует время начала матча");
  return { id, match, starts: new Date(Number(date) * 1000).toISOString() };
}

async function parallelMatches(matches, job, source) {
  const groups = [];
  for (let i = 0; i < matches.length; i += 5) {
    groups.push(...await Promise.all(matches.slice(i, i + 5).map(async (event) => {
      try {
        const unique = new Map();
        for (const [player, total, over, under] of await job(event)) {
          const key = JSON.stringify([player, total]);
          const previous = unique.get(key);
          if (!unique.has(key)) unique.set(key, [player, total, over, under, event.match, source, event.starts]);
          else if (previous && (previous[2] !== over || previous[3] !== under)) unique.set(key, null);
        }
        const rows = [...unique.values()].filter(Boolean);
        const conflicts = unique.size - rows.length;
        return {
          rows, status: [source, event.match, conflicts ? "Есть замечания" : rows.length ? "Собрано" : "Нет рынков",
            rows.length, conflicts ? "Источник дал разные коэффициенты для одной линии" :
              rows.length ? "" : "В линии пока нет полных пар на очки игроков"],
        };
      } catch (error) {
        return { rows: [], status: [source, event.match, "Ошибка", 0, error.message] };
      }
    })));
  }
  return {
    rows: groups.flatMap((x) => x.rows),
    status: groups.length ? groups.map((x) => x.status) : [[source, "—", "Нет матчей", 0, "В прематчевой линии не найдено матчей NBA"]],
  };
}

export function fonbetPoints(data, eventId, tables) {
  if (!Array.isArray(data.events) || !Array.isArray(data.customFactors) ||
      !data.events.some((e) => e.id === eventId)) throw new Error("Карточка матча отсутствует в ответе FONBET");
  const events = new Map(data.events.map((e) => [e.id, e]));
  const blocking = new Map((data.eventBlocks || []).map((b) => [b.eventId, b]));
  if (blocking.get(eventId)?.state === "blocked") return [];
  const factors = new Map();
  for (const group of data.customFactors) {
    const all = factors.get(group.e) || [];
    all.push(...(group.factors || []));
    factors.set(group.e, all);
  }
  const rows = [];
  for (const p of data.events) {
    const parent = events.get(p.parentId);
    const codes = tables.get(Number(p.specialTableId));
    const block = blocking.get(p.id);
    if (!codes || p.kind !== 91 || !p.team1 || p.team2 || p.place !== "line" ||
        parent?.kind !== 90 || parent.parentId !== eventId || block?.state === "blocked") continue;
    const byTotal = new Map();
    for (const f of factors.get(p.id) || []) {
      const side = codes.indexOf(f.f);
      if (side < 0 || f.b || f.blocked || block?.factors?.includes(f.f) || !odds(f.v)) continue;
      const value = f.pt != null ? String(f.pt).replace(",", ".") : validNumber(f.p) ? Number(f.p) / 100 : null;
      if (!points(value)) continue;
      const total = Number(value);
      const pair = byTotal.get(total) || [new Set(), new Set()];
      pair[side].add(Number(f.v));
      byTotal.set(total, pair);
    }
    for (const [total, [over, under]] of byTotal) {
      if (over.size === 1 && under.size === 1) rows.push([p.team1, total, [...over][0], [...under][0]]);
    }
  }
  return rows;
}

async function fonbet() {
  const common = { lang: "en", scopeMarket: 1600 };
  const [catalog, data] = await Promise.all([
    feed(FONBET, "/line/factorsCatalog/specialTables", { lang: "en", version: 0, sysId: 1 }),
    feed(FONBET, "/events/list", common),
  ]);
  const tables = new Map();
  for (const t of catalog.specialTables || []) {
    if (t.lineCaptionType !== "1player" || !/basketball/i.test(t.caption)) continue;
    const columns = new Map((t.columns || []).filter((c) => c.type === "value")
      .map((c) => [c.caption.trim().toLowerCase(), Number(c.f)]));
    if (columns.has("points|o") && columns.has("points|u"))
      tables.set(Number(t.id), [columns.get("points|o"), columns.get("points|u")]);
  }
  if (!tables.size || !Array.isArray(data.sports) || !Array.isArray(data.events)) {
    throw new Error("Изменился формат линии FONBET");
  }
  const sports = new Map(data.sports.map((s) => [s.id, s]));
  function basketball(sport) {
    const seen = new Set();
    while (sport && !seen.has(sport.id)) {
      seen.add(sport.id);
      if (sport.alias === "basketball" || /^basketball$/i.test(sport.name)) return true;
      sport = sports.get(sport.parentId);
    }
    return false;
  }
  const leagues = new Set(data.sports.filter((s) => nba.test(s.name) && basketball(s) &&
    !s.specialTableId && !/2k|esports?|outright|winner|season stats|summer/i.test(s.name)).map((s) => s.id));
  const events = data.events.filter((e) => leagues.has(e.sportId) && e.level === 1 && e.kind === 1 &&
    !e.parentId && !!e.team1 && !!e.team2 && e.team1Id > 0 && e.team2Id > 0 && e.place === "line");
  const matches = events.map((e) => makeMatch(e.id, e.team1 + " — " + e.team2, e.startTime));
  return parallelMatches(matches, async ({ id }) => fonbetPoints(
    await feed(FONBET, "/events/event", { ...common, eventId: id }), id, tables), "FONBET");
}

function bc(path, params = {}) {
  return feed(BETCITY, path, { csn: "ooca9s", lng: 1, ...params });
}

function bcLeagues(data) {
  const sport = data.reply?.sports?.["3"];
  if (!data.reply?.sports) throw new Error("Изменился формат линии БЕТСИТИ");
  return list(sport?.chmps).filter((c) => enMatchLeague.test(c.name_ch) &&
    !Number(c.is_cyber) && !Number(c.is_future) && !Number(c.future) && !Number(c.is_stat));
}

export function betcityPoints(data, id) {
  const e = bcLeagues(data).map((c) => c.evts?.[id]).find(Boolean);
  if (!e) throw new Error("Карточка матча отсутствует в ответе БЕТСИТИ");
  const market = e.ext?.["971"];
  if (!market) return [];
  if (!/^(players|игроки)$/i.test(market.name?.trim() || "") || !market.rows)
    throw new Error("Изменился формат рынка «Игроки» БЕТСИТИ");
  const rows = [];
  for (const player of list(market.rows)) {
    if (!player.name?.trim()) continue;
    for (const cell of list(player.data)) {
      const line = cell.blocks?.T1m;
      if (!line || !points(line.Tot) || !odds(line.Tb?.kf) || !odds(line.Tm?.kf)) continue;
      const total = Number(line.Tot);
      if ([line.Tb, line.Tm].some((side) => side.lv != null && Number(side.lv) !== total)) continue;
      rows.push([player.name.trim(), total, Number(line.Tb.kf), Number(line.Tm.kf)]);
    }
  }
  return rows;
}

async function betcity() {
  const board = await bc("/off/champs");
  const leagues = bcLeagues(board).map((c) => c.id_ch);
  const events = leagues.length ? bcLeagues(await bc("/off/events", { ids: leagues.join(","), rev: 6 }))
    .flatMap((c) => list(c.evts)) : [];
  const matches = [...new Map(events.filter((e) => !Number(e.del_ev) && !Number(e.is_dep) &&
    !Number(e.fut) && !Number(e.is_online) && !Number(e.is_esports) && e.id_ht && e.id_at)
    .map((e) => [e.id_ev, makeMatch(e.id_ev, (e.name_ht || (e.id_ht === 627 ? "Oklahoma City Thunder" : "Команда " + e.id_ht)) +
      " — " + (e.name_at || (e.id_at === 637 ? "Atlanta Hawks" : "Команда " + e.id_at)), e.date_ev)])).values()];
  return parallelMatches(matches, async ({ id }) => betcityPoints(
    await bc("/off/events", { id_ev: id, rev: 6, ext: 1 }), id), "БЕТСИТИ");
}

export async function collect() {
  const startedAt = new Date().toISOString();
  const providers = [["FONBET", fonbet], ["БЕТСИТИ", betcity]];
  const results = await Promise.all(providers.map(async ([name, adapter]) => {
    try { return await adapter(); }
    catch (error) { return { rows: [], status: [[name, "—", "Ошибка источника", 0, error.message]] }; }
  }));
  const rows = results.flatMap((r) => r.rows).sort((a, b) =>
    a[6].localeCompare(b[6]) || a[5].localeCompare(b[5], "ru") ||
    a[4].localeCompare(b[4]) || a[0].localeCompare(b[0]) || a[1] - b[1]);
  return { startedAt, rows, status: results.flatMap((r) => r.status) };
}
