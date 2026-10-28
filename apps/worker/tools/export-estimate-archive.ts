import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEstimateArchive } from "../src/ocr/estimate-archive";
const [directory, rawSources, output] = Bun.argv.slice(2);
if (!directory || !rawSources || !output)
  throw new Error(
    "Use export-estimate-archive.ts INPUT_DIRECTORY SOURCE_TEAMS NEW_SQL_PATH",
  );
const names = (await readdir(directory))
  .filter((n) => /^2026[a-z0-9]+_qm\d+\.json$/.test(n))
  .sort();
if (names.length > 100) throw new Error("Archive match budget exceeded");
let total = 0;
const inputs = [];
for (const name of names) {
  const bytes = await readFile(join(directory, name));
  total += bytes.length;
  if (bytes.length > 4 * 1024 * 1024 || total > 64 * 1024 * 1024)
    throw new Error("Archive input budget exceeded");
  const input = JSON.parse(bytes.toString());
  if (input.matchKey + ".json" !== name)
    throw new Error("Archive file identity mismatch");
  inputs.push(input);
}
const result = buildEstimateArchive(inputs, rawSources.split(",").map(Number));
for (const [path, data] of [
  [output, result.sql],
  [output + ".verify.sql", result.verificationSql],
  [output + ".manifest.json", JSON.stringify(result.manifest, null, 2) + "\n"],
])
  await writeFile(path!, data!, { flag: "wx", mode: 0o600 });
console.info(JSON.stringify(result.manifest));
