import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { examineReportAlignment } from "../src/ocr/report-alignment-experiment";

const [inputPath, outputPath, sourceList] = Bun.argv.slice(2);
if (!inputPath || !outputPath || !sourceList || !/^\d+(,\d+)*$/.test(sourceList))
  throw new Error("Use benchmark-report-alignment.ts INPUT_DIRECTORY EMPTY_OUTPUT_DIRECTORY SOURCE_TEAMS");
const sources = sourceList.split(",").map(Number);
const input = resolve(inputPath), output = resolve(outputPath);
if (input === output || output.startsWith(input + "/")) throw new Error("Keep outputs separate from inputs");
const files = (await readdir(input)).filter(f => /^2026cacg_qm\d+\.json$/.test(f)).sort();
if (!files.length) throw new Error("No CalGames match inputs");
await mkdir(output, { recursive: true, mode: 0o700 });
if ((await readdir(output)).length) throw new Error("Output directory must be empty");
const results = [];
for (const file of files) {
  const bytes = await readFile(join(input, file));
  const result = examineReportAlignment(JSON.parse(bytes.toString()), sources);
  if (result.matchKey + ".json" !== file) throw new Error("Input filename/match mismatch");
  results.push(result);
  await writeFile(join(output, file), JSON.stringify({ inputSha256: createHash("sha256").update(bytes).digest("hex"), ...result }, null, 2) + "\n", { mode: 0o600 });
}
const statuses: Record<string, number> = {};
const rejections: Record<string, number> = {};
for (const report of results.flatMap(r => r.reports)) {
  statuses[report.status] = (statuses[report.status] ?? 0) + 1;
  for (const [key, count] of Object.entries(report.rejections)) rejections[key] = (rejections[key] ?? 0) + count;
}
const summary = { matches: results.length, reports: results.reduce((n, r) => n + r.reports.length, 0),
  sourceTeams: [...new Set(sources)].sort((a, b) => a - b), statuses, rejections, promoted: false,
  caveat: results[0]!.caveat };
await writeFile(join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(summary));
