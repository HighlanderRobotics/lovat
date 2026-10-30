import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fuseMatch } from "../src/ocr/fusion";
import {
  contributionCsv,
  contributionTables,
} from "../src/ocr/contribution-export";

const args = Bun.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const inputPath = option("--input"),
  outputPath = option("--output");
const sources = [
  ...new Set((option("--source-teams") ?? "").split(",").map(Number)),
].sort((a, b) => a - b);
const expected = option("--expected-matches");
if (
  !inputPath ||
  !outputPath ||
  sources.some((n) => !Number.isSafeInteger(n) || n < 1) ||
  !sources.length ||
  (expected !== undefined && (!/^\d+$/.test(expected) || Number(expected) < 1))
)
  throw new Error(
    "Use --input DIR --output EMPTY_DIR --source-teams 1967,8033 [--expected-matches 37]",
  );
const input = resolve(inputPath),
  output = resolve(outputPath);
if (input === output)
  throw new Error("Keep inputs and exports in separate directories");
const files = (await readdir(input))
  .filter((file) => file.endsWith(".json"))
  .sort();
const results = [];
for (const file of files) {
  const record = JSON.parse(await readFile(join(input, file), "utf8"));
  const result = fuseMatch(record.fusionInput ?? record, sources);
  if (!("officialResultAvailable" in result))
    throw new Error("Contribution exports require official TBA phase budgets");
  results.push(result);
}
results.sort(
  (a, b) =>
    Number(a.matchKey.match(/_qm(\d+)$/)?.[1] ?? 0) -
      Number(b.matchKey.match(/_qm(\d+)$/)?.[1] ?? 0) ||
    (a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : 0),
);
if (expected !== undefined && results.length !== Number(expected))
  throw new Error("Unexpected match count");
const tables = contributionTables(results);
const contents = {
  "team-contributions.csv": contributionCsv(tables.teams),
  "alliance-reconciliation.csv": contributionCsv(tables.alliances),
  "estimates.json": JSON.stringify(results, null, 2) + "\n",
};
await mkdir(output, { recursive: true, mode: 0o700 });
if ((await readdir(output)).length)
  throw new Error("Export directory must be empty");
const hashes = Object.fromEntries(
  Object.entries(contents).map(([name, text]) => [
    name,
    createHash("sha256").update(text).digest("hex"),
  ]),
);
for (const [name, text] of Object.entries(contents))
  await writeFile(join(output, name), text, { mode: 0o600 });
const manifest = {
  matches: results.length,
  teamRows: tables.teams.length,
  allianceRows: tables.alliances.length,
  sourceTeams: sources,
  files: hashes,
  inputs: results.map((r) => ({
    matchKey: r.matchKey,
    algorithm: r.algorithm,
    semanticInputSha256: r.semanticInputSha256,
  })),
  limitations: [
    "Robot contributions are estimates; disputed and unseen fuel remain unattributed.",
    "Foul credit is alliance-only; endgame fuel is part of teleop and is not counted twice.",
    "Human-player fuel can overlap robot scoring windows and remains a known attribution limitation.",
  ],
};
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    output,
    matches: manifest.matches,
    teamRows: manifest.teamRows,
    allianceRows: manifest.allianceRows,
  }),
);
