import { expect, test } from "bun:test";
import { join } from "node:path";
import { measureNativeBatch, readNativeResources, resourceSchema } from "../src/ocr/resource-benchmark";

const snapshot = (usage = 0, instanceId = "instance-one") => resourceSchema.parse({ instanceId,
  cpuQuotaCores: 2, cpuUsageMicros: usage, memoryCurrentBytes: 30, memoryPeakBytes: 40,
  processRssBytes: 10, processPeakRssBytes: 20, decoderThreads: 1, configuredConcurrency: 2, availableSlots: 2 });

test("Railway resource runner refuses production and logs no raw configuration", async () => {
  const child = Bun.spawn([process.execPath, "tools/benchmark-native-railway.ts"], {
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, RAILWAY_ENVIRONMENT_ID: "production", OCR_RESOURCE_RUN_ID: "test",
      OCR_RESOURCE_DECODER_THREADS: "1", OCR_RESOURCE_PREFLIGHT: "1", PORT: "0",
      OCR_SERVICE_TOKEN: "secret-should-not-be-logged" + "x".repeat(32),
      OCR_SERVICE_URL: "http://scoreboard-ocr.railway.internal:8080" },
    stdout: "pipe", stderr: "pipe",
  });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(code).toBe(1); expect(out).toBe("");
  expect(err.trim()).toBe("resource_benchmark_error=configuration");
});

test("resource client authenticates and bounds replies before parsing", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async (input: any, init: any) => {
      calls++; expect(new URL(String(input)).pathname).toBe("/resources");
      expect(init.headers.Authorization).toBe(`Bearer ${"x".repeat(32)}`);
      expect(init.redirect).toBe("error");
      return calls === 1 ? Response.json(snapshot()) : new Response("x".repeat(4097));
    }) as any;
    await expect(readNativeResources("http://localhost", "short")).rejects.toThrow("token missing");
    expect(calls).toBe(0);
    expect((await readNativeResources("http://localhost", "x".repeat(32))).cpuQuotaCores).toBe(2);
    await expect(readNativeResources("http://localhost", "x".repeat(32))).rejects.toThrow("exceeds budget");
  } finally { globalThis.fetch = original; }
});

test("resource benchmark verifies quota, bounded concurrency, drained work and CPU deltas", async () => {
  let active = 0, maximum = 0, usage = 0;
  const result = await measureNativeBatch([1, 2, 3, 4], 2, async item => {
    active++; maximum = Math.max(maximum, active); await Bun.sleep(3); active--; usage += 1000; return item;
  }, async () => snapshot(usage), 1, { pollMs: 1 });
  expect(maximum).toBe(2); expect(active).toBe(0);
  expect(result.records.sort()).toEqual([1, 2, 3, 4]);
  expect(result.resources.cpuSeconds).toBe(.004);
  let called = false;
  await expect(measureNativeBatch([1], 1, async () => { called = true; }, async () => ({ ...snapshot(), cpuQuotaCores: null }), 1)).rejects.toThrow("quota");
  expect(called).toBe(false);
});

test("resource benchmark rejects restarted/configuration-changing processors and drains errors", async () => {
  let reads = 0, drained = false;
  await expect(measureNativeBatch([1, 2], 2, async item => {
    await Bun.sleep(item === 1 ? 1 : 4); if (item === 1) throw new Error("work failed"); drained = true;
  }, async () => snapshot(), 1)).rejects.toThrow("work failed");
  expect(drained).toBe(true);
  await expect(measureNativeBatch([1], 1, async () => 1,
    async () => snapshot(0, ++reads === 1 ? "before" : "after"), 1)).rejects.toThrow("instance changed");
  await expect(measureNativeBatch([1], 1, async () => 1,
    async () => ({ ...snapshot(), decoderThreads: 2 }), 1)).rejects.toThrow("configuration mismatch");
});
