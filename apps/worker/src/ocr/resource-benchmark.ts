import { z } from "zod";
import { runOcrPool } from "./pool";

const counter = z.number().int().nonnegative().nullable();
export const resourceSchema = z.object({
  instanceId: z.string().min(1).max(80), cpuQuotaCores: z.number().positive().nullable(),
  cpuUsageMicros: counter, memoryCurrentBytes: counter, memoryPeakBytes: counter,
  processRssBytes: counter, processPeakRssBytes: counter,
  decoderThreads: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  configuredConcurrency: z.union([z.literal(1), z.literal(2)]),
  availableSlots: z.number().int().min(0).max(2),
});
type Resources = z.infer<typeof resourceSchema>;

export async function readNativeResources(endpoint: string, token: string): Promise<Resources> {
  if (token.length < 32) throw new Error("Native benchmark token missing");
  const response = await fetch(new URL("/resources", endpoint), {
    headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Native resource counters unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Native resource response missing");
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  try { while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw new Error("Native resource response exceeds budget"); }
    text += decoder.decode(chunk.value, { stream: true });
  } } finally { reader.releaseLock(); }
  text += decoder.decode();
  return resourceSchema.parse(JSON.parse(text));
}

export async function measureNativeBatch<T, R>(
  items: T[], concurrency: number, work: (item: T) => Promise<R>,
  read: () => Promise<Resources>, expectedDecoderThreads: number,
  options: { pollMs?: number; stopped?: () => boolean } = {},
) {
  if (!items.length || items.length > 100 || (options.pollMs !== undefined && (!Number.isFinite(options.pollMs) || options.pollMs < 1 || options.pollMs > 5000)))
    throw new Error("Native benchmark item or sampling budget invalid");
  const before = resourceSchema.parse(await read());
  const verify = (sample: Resources) => {
    if (sample.cpuQuotaCores === null || Math.abs(sample.cpuQuotaCores - 2) > .000001)
      throw new Error("Native benchmark requires a verified two-CPU quota");
    if (sample.instanceId !== before.instanceId) throw new Error("Native instance changed during benchmark");
    if (sample.decoderThreads !== expectedDecoderThreads || sample.configuredConcurrency !== 2)
      throw new Error("Native benchmark configuration mismatch");
    if (sample.cpuUsageMicros === null || sample.processRssBytes === null || sample.memoryCurrentBytes === null)
      throw new Error("Native Linux usage counters unavailable");
  };
  verify(before);
  if (before.availableSlots !== 2) throw new Error("Native benchmark needs an idle processor");
  let maximumProcessRssBytes = before.processRssBytes!, maximumContainerBytes = before.memoryCurrentBytes!;
  let stopped = false, monitorFailed = false, monitorError: unknown, timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const monitor = (async () => {
    while (!stopped) {
      await new Promise<void>(resolve => { wake = resolve; timer = setTimeout(resolve, options.pollMs ?? 500); });
      if (stopped) break;
      try {
        const sample = resourceSchema.parse(await read()); verify(sample);
        maximumProcessRssBytes = Math.max(maximumProcessRssBytes, sample.processRssBytes!);
        maximumContainerBytes = Math.max(maximumContainerBytes, sample.memoryCurrentBytes!);
      } catch (error) { monitorFailed = true; monitorError = error; break; }
    }
  })();
  const records: R[] = [];
  const started = performance.now();
  try {
    await runOcrPool(items, concurrency, async item => {
      records.push(await work(item));
      if (monitorFailed) throw monitorError;
    }, () => Boolean(options.stopped?.()) || monitorFailed);
  } finally {
    stopped = true; if (timer) clearTimeout(timer); wake?.(); await monitor;
  }
  if (monitorFailed) throw monitorError;
  if (records.length !== items.length) throw new Error("Native benchmark interrupted before completion");
  const elapsedMs = performance.now() - started;
  const after = resourceSchema.parse(await read()); verify(after);
  if (after.availableSlots !== 2 || after.cpuUsageMicros! < before.cpuUsageMicros!)
    throw new Error("Native benchmark did not drain or usage counters reset");
  maximumProcessRssBytes = Math.max(maximumProcessRssBytes, after.processRssBytes!);
  maximumContainerBytes = Math.max(maximumContainerBytes, after.memoryCurrentBytes!);
  return { records, resources: { before, after, maximumProcessRssBytes, maximumContainerBytes,
    cpuSeconds: (after.cpuUsageMicros! - before.cpuUsageMicros!) / 1e6,
    elapsedMs, matchesPerMinute: records.length * 60000 / elapsedMs,
    note: "CPU is the native container delta, including subprocesses and sampling. RSS excludes decoder children; container memory includes children/cache. Sampled maxima may miss brief spikes; peak counters are process/container-lifetime values." } };
}
