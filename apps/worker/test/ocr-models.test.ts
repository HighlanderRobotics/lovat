import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import models from "../config/ocr-models.json";

test("model registry pins distinct official artifacts and rejects invalid local bytes", async () => {
  expect(models.fast.sha256).not.toBe(models.best.sha256);
  for (const model of Object.values(models)) {
    expect(model.repository).toMatch(/^tesseract-ocr\/tessdata_(fast|best)$/);
    expect(model.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(model.file).toBe("eng.traineddata");
    expect(model.bytes).toBeGreaterThan(0);
  }
  const dir = await mkdtemp(join(tmpdir(), "lovat-model-pin-"));
  try {
    const source = join(dir, "wrong-model");
    await writeFile(source, "wrong bytes");
    const child = Bun.spawn(
      [
        process.execPath,
        "tools/stage-ocr-model.ts",
        "--model",
        "fast",
        "--source",
        source,
        "--output",
        join(dir, "out"),
      ],
      { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" },
    );
    const [code, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("size/hash mismatch");
    expect(await readdir(join(dir, "out"))).toEqual([]);
    expect(await readFile(source, "utf8")).toBe("wrong bytes");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
