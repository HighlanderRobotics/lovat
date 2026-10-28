import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import models from "../config/ocr-models.json";

const args = Bun.argv.slice(2);
const name = args[args.indexOf("--model") + 1];
const outputPath = args.includes("--output")
  ? args[args.indexOf("--output") + 1]
  : undefined;
if (
  !args.includes("--model") ||
  !["fast", "best"].includes(name ?? "") ||
  !outputPath
)
  throw new Error(
    "Use --model fast|best --output EMPTY_DIR [--source EXISTING_MODEL]",
  );
const model = models[name as keyof typeof models];
const output = resolve(outputPath);
await mkdir(output, { recursive: true, mode: 0o700 });
if ((await readdir(output)).length)
  throw new Error("Model output directory must be empty");
const source = args.includes("--source")
  ? args[args.indexOf("--source") + 1]
  : undefined;
if (args.includes("--source") && !source)
  throw new Error("Existing model path missing");
const url = `https://raw.githubusercontent.com/${model.repository}/${model.revision}/${model.file}`;
let bytes: Uint8Array;
if (source) {
  if ((await stat(source)).size !== model.bytes)
    throw new Error("Pinned model size/hash mismatch");
  bytes = await readFile(source);
} else {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error("Pinned model download failed");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Model body missing");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > model.bytes) {
        await reader.cancel();
        throw new Error("Pinned model size exceeded");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
}
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (bytes.byteLength !== model.bytes || sha256 !== model.sha256)
  throw new Error("Pinned model size/hash mismatch");
await writeFile(join(output, model.file), bytes, { mode: 0o600 });
await writeFile(
  join(output, "model-receipt.json"),
  JSON.stringify({ name, ...model, url }, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({ model: name, sha256, bytes: bytes.byteLength, output }),
);
