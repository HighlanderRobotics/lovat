import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { selectFieldProfiles } from "../src/ocr/field-profile-experiment";

const [gridPath, referencePath, outputPath] = Bun.argv.slice(2);
if (!gridPath || !referencePath || !outputPath) throw new Error("Use select-field-profiles.ts GRID_JSON REFERENCES_JSON NEW_OUTPUT_JSON");
const [grid, references] = await Promise.all([readFile(gridPath), readFile(referencePath)]);
if (grid.length > 32 * 1024 * 1024 || references.length > 1024 * 1024) throw new Error("Experiment inputs exceed budget");
const result = selectFieldProfiles(JSON.parse(grid.toString()), JSON.parse(references.toString()));
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const selectionSha256 = hash(Buffer.from(JSON.stringify(result.results.map(r => ({ field: r.field, profile: r.selected.profile })))));
await writeFile(outputPath, JSON.stringify({ gridSha256: hash(grid), referencesSha256: hash(references), selectionSha256, ...result }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ selectionSha256, fields: result.results.map(({ field, baseline, selected }) => ({ field, baseline, selected })) }));
