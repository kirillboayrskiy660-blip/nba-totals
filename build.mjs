import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { collect } from "./lib/sources.js";
import { dateText, displayRow, excel, headers, statusHeaders } from "./lib/excel.js";

const report = await collect();
for (const status of report.status) console.log(status.join(" | "));
if (report.status.every((status) => status[2].startsWith("Ошибка"))) {
  throw new Error("Обе линии недоступны. Последняя опубликованная версия отчёта сохранится.");
}

const output = new URL("./dist/", import.meta.url);
await mkdir(output, { recursive: true });
for (const file of ["index.html", "style.css"]) {
  await copyFile(new URL("./site/" + file, import.meta.url), new URL(file, output));
}
await build({
  entryPoints: [new URL("./site/ui.js", import.meta.url).pathname],
  outfile: new URL("ui.js", output).pathname,
  bundle: true,
  format: "iife",
  platform: "browser",
});
const repository = process.env.GITHUB_REPOSITORY || "";
const ownerLink = /^[\w.-]+\/[\w.-]+$/.test(repository)
  ? "https://github.com/" + repository + "/actions/workflows/nba-report.yml" : null;
await Promise.all([
  writeFile(new URL("report.json", output), JSON.stringify({
    ...report,
    startedLabel: dateText(report.startedAt),
    rows: report.rows.map(displayRow),
    teamRows: report.teamRows.map(displayRow),
    headers, statusHeaders, ownerLink,
  })),
  writeFile(new URL("NBA_totals.xlsx", output), excel(report)),
  writeFile(new URL(".nojekyll", output), ""),
]);
console.log("Опубликованных строк в сборке:", report.rows.length);
