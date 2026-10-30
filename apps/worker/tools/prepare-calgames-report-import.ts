import { readFile, writeFile } from "node:fs/promises";
import { buildCalgamesReportImport } from "../src/calgames-report-archive";
const [input, guardFile, output] = Bun.argv.slice(2);
if (!input || !guardFile || !output)
  throw Error(
    "Use prepare-calgames-report-import.ts PRIVATE_JSON PRIVATE_TARGET_GUARD NEW_SQL",
  );
const bytes = await readFile(input);
if (bytes.length > 128 * 1024 * 1024) throw Error("Archive too large");
const result = buildCalgamesReportImport(
  JSON.parse(bytes.toString()),
  JSON.parse(await readFile(guardFile, "utf8")),
);
await writeFile(output, result.sql, { flag: "wx", mode: 0o600 });
await writeFile(
  output + ".manifest.json",
  JSON.stringify(result.manifest, null, 2) + "\n",
  { flag: "wx", mode: 0o600 },
);
console.info(JSON.stringify(result.manifest));
