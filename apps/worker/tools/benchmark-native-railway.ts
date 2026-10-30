// One-shot PR #95 benchmark using only the Worker's pre-existing private
// media/native access. No SQL, new grants, signed capabilities or public URL.
import { S3Client } from "bun";
import { assertEvidenceExtension } from "../src/ocr/evidence-extension";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import cases from "../config/ocr-benchmark-calgames.json";
import configuredTemplate from "../config/scoreboard-2026-calgames.json";
import { templateSchema } from "../src/ocr/media";
import { extractServiceEvidence } from "../src/ocr/service";
import {
  measureNativeBatch,
  readNativeResources,
} from "../src/ocr/resource-benchmark";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function main() {
  const runId = process.env.OCR_RESOURCE_RUN_ID ?? "",
    referenceRun = process.env.OCR_RESOURCE_REFERENCE_RUN || undefined;
  const referenceMode = process.env.OCR_RESOURCE_REFERENCE_MODE ?? "exact";
  if (
    !["exact", "extend"].includes(referenceMode) ||
    (referenceMode === "extend" && !referenceRun)
  )
    throw Error("Invalid reference mode");
  const expectedThreads = Number(process.env.OCR_RESOURCE_DECODER_THREADS);
  const endpoint = process.env.OCR_SERVICE_URL ?? "",
    token = process.env.OCR_SERVICE_TOKEN ?? "";
  if (
    process.env.RAILWAY_ENVIRONMENT_ID !==
      "51f783a8-01c1-4d64-ad5b-11ac94d54c17" ||
    !/^[a-z0-9-]{1,64}$/.test(runId) ||
    (referenceRun !== undefined && !/^[a-z0-9-]{1,64}$/.test(referenceRun)) ||
    ![1, 2, 4].includes(expectedThreads) ||
    token.length < 32
  )
    throw new Error("Benchmark scope/configuration invalid");
  const nativeUrl = new URL(endpoint);
  if (
    !nativeUrl.hostname.endsWith(".railway.internal") ||
    !["http:", "https:"].includes(nativeUrl.protocol) ||
    nativeUrl.username ||
    nativeUrl.password ||
    nativeUrl.search ||
    nativeUrl.hash
  )
    throw new Error("Private native endpoint required");
  const template = templateSchema.parse(configuredTemplate);
  const prefix = `benchmarks/calgames-resource/${runId}`;
  let stopped = false;
  process.once("SIGTERM", () => {
    stopped = true;
  });
  process.once("SIGINT", () => {
    stopped = true;
  });
  const health = Bun.serve({
    port: Number(process.env.PORT ?? 8080),
    fetch: (request) =>
      new Response(
        new URL(request.url).pathname === "/health" ? "ok" : "Not found",
        { status: new URL(request.url).pathname === "/health" ? 200 : 404 },
      ),
  });
  const directory = await mkdtemp(join(tmpdir(), "lovat-native-resources-"));
  let stage = "verify-resources";
  try {
    const read = () => readNativeResources(endpoint, token);
    const initial = await read();
    console.info("resource_initial=" + JSON.stringify(initial));
    if (process.env.OCR_RESOURCE_PREFLIGHT === "1") {
      // Give Railway's normal healthcheck time to observe the one-shot task.
      // This mode reads only numeric counters, without opening the bucket.
      await Bun.sleep(10000);
      return;
    }
    if (
      initial.cpuQuotaCores !== 2 ||
      initial.decoderThreads !== expectedThreads ||
      initial.configuredConcurrency !== 2
    )
      throw new Error("Native benchmark configuration mismatch");
    stage = "open-existing-media-store";
    const storageEndpoint = new URL(process.env.OCR_MEDIA_ENDPOINT!);
    if (
      storageEndpoint.href !== "https://t3.storageapi.dev/" ||
      process.env.OCR_MEDIA_BUCKET !== "ocr-calgames-media-rg-qxw" ||
      !process.env.OCR_MEDIA_ACCESS_KEY_ID ||
      !process.env.OCR_MEDIA_SECRET_ACCESS_KEY
    )
      throw new Error("Existing private media access unavailable");
    storageEndpoint.hostname = `${process.env.OCR_MEDIA_BUCKET}.${storageEndpoint.hostname}`;
    const store = new S3Client({
      endpoint: storageEndpoint.href,
      virtualHostedStyle: true,
      region: process.env.OCR_MEDIA_REGION ?? "auto",
      accessKeyId: process.env.OCR_MEDIA_ACCESS_KEY_ID,
      secretAccessKey: process.env.OCR_MEDIA_SECRET_ACCESS_KEY,
    });
    const sentinel = store.file(`${prefix}/manifest.json`);
    if (await sentinel.exists())
      throw new Error("Benchmark run ID already used");
    await sentinel.write(
      JSON.stringify({ runId, expectedThreads, template, cases, initial }),
    );
    stage = "load-fixed-media";
    const media: {
      matchKey: string;
      videoKey: string;
      expectedTeams: number[];
      expectedMatchLabel: string;
      path: string;
      mediaSha256: string;
    }[] = [];
    for (const item of cases) {
      if (stopped) throw new Error("Benchmark interrupted");
      const object = store.file(`media/2026cacg/${item.videoKey}.mp4`);
      if (
        !(await object.exists()) ||
        (await object.stat()).size > 96 * 1024 * 1024
      )
        throw new Error("Fixed staged benchmark video unavailable");
      const path = join(directory, item.matchKey + ".mp4");
      await Bun.write(path, object);
      media.push({
        ...item,
        path,
        mediaSha256: hash(new Uint8Array(await Bun.file(path).arrayBuffer())),
      });
    }
    const baseline: Record<
      string,
      { mediaSha256: string; evidenceSha256: string; runtime: unknown }
    > = referenceRun
      ? await store
          .file(`benchmarks/calgames-resource/${referenceRun}/reference.json`)
          .json()
      : {};
    if (
      referenceRun &&
      (Object.keys(baseline).length !== 4 ||
        cases.some((c) => !baseline[c.matchKey]))
    )
      throw new Error("Reference benchmark incomplete");
    const reference: typeof baseline = {};
    const priorEvidence = new Map<
      string,
      Awaited<ReturnType<typeof extractServiceEvidence>>
    >();
    if (referenceMode === "extend")
      for (const item of media) {
        const prior = await store
          .file(
            `benchmarks/calgames-resource/${referenceRun}/one-a/${item.matchKey}.json`,
          )
          .json();
        priorEvidence.set(item.matchKey, prior.evidence);
      }
    const phases = [];
    for (const [label, concurrency, reverse] of [
      ["one-a", 1, false],
      ["two-a", 2, false],
      ["two-b", 2, true],
      ["one-b", 1, true],
    ] as const) {
      stage = "measure-" + label;
      const phase = await measureNativeBatch(
        reverse ? [...media].reverse() : media,
        concurrency,
        async (item) => {
          const started = performance.now();
          const evidence = await extractServiceEvidence(
            item.path,
            item.expectedTeams,
            item.expectedMatchLabel,
            template,
            endpoint,
            token,
          );
          const record = {
            runId,
            phase: label,
            matchKey: item.matchKey,
            mediaSha256: item.mediaSha256,
            evidenceSha256: hash(
              JSON.stringify({
                observations: evidence.observations,
                channels: evidence.channels,
                layoutVersion: evidence.layoutVersion,
              }),
            ),
            runtime: evidence.runtime ?? null,
            fuelWordFallback: evidence.fuelWordFallback ?? false,
            recognitionCache: evidence.recognitionCache ?? false,
            extension:
              referenceMode === "extend"
                ? assertEvidenceExtension(
                    priorEvidence.get(item.matchKey)!,
                    evidence,
                  )
                : undefined,
            elapsedMs: performance.now() - started,
            pairedSamples: evidence.observations.length,
            redSamples: evidence.channels?.red.length ?? 0,
            blueSamples: evidence.channels?.blue.length ?? 0,
            decoderThreads: evidence.profile?.decoderThreads,
          };
          const prior = baseline[item.matchKey];
          const repeat = reference[item.matchKey];
          if (repeat && repeat.evidenceSha256 !== record.evidenceSha256)
            throw Error("Candidate evidence changed between repeats");
          if (
            process.env.OCR_RESOURCE_EXPECT_WORD_FALLBACK === "1" &&
            !record.fuelWordFallback
          )
            throw Error("Word recovery is not enabled");
          if (
            record.decoderThreads !== expectedThreads ||
            !evidence.runtime ||
            (prior &&
              (prior.mediaSha256 !== record.mediaSha256 ||
                (referenceMode === "exact" &&
                  prior.evidenceSha256 !== record.evidenceSha256) ||
                JSON.stringify(prior.runtime) !==
                  JSON.stringify(record.runtime)))
          )
            throw new Error("Native evidence/runtime changed during benchmark");
          reference[item.matchKey] ??= {
            mediaSha256: record.mediaSha256,
            evidenceSha256: record.evidenceSha256,
            runtime: record.runtime,
          };
          await store
            .file(`${prefix}/${label}/${item.matchKey}.json`)
            .write(JSON.stringify({ ...record, evidence }));
          console.info("resource_case=" + JSON.stringify(record));
          return record;
        },
        read,
        expectedThreads,
        { stopped: () => stopped },
      );
      const times = phase.records.map((r) => r.elapsedMs).sort((a, b) => a - b);
      const result = {
        label,
        concurrency,
        resources: phase.resources,
        requestP95Ms: times[Math.ceil(times.length * 0.95) - 1],
        requestMedianMs: (times[1]! + times[2]!) / 2,
        cases: phase.records.length,
      };
      phases.push(result);
      await store
        .file(`${prefix}/reference.json`)
        .write(JSON.stringify(reference));
      await store
        .file(`${prefix}/progress.json`)
        .write(
          JSON.stringify({ runId, expectedThreads, phases, finished: false }),
        );
      console.info("resource_phase=" + JSON.stringify(result));
    }
    stage = "write-summary";
    const summary = {
      runId,
      expectedThreads,
      referenceMode,
      phases,
      reference,
      finished: true,
    };
    await store.file(`${prefix}/summary.json`).write(JSON.stringify(summary));
    console.info("resource_summary=" + JSON.stringify(summary));
  } catch {
    // No raw S3/native exceptions, URLs, tokens or environment values in logs.
    console.error(
      "resource_benchmark_error=" + JSON.stringify({ runId, stage }),
    );
    process.exitCode = 1;
  } finally {
    health.stop();
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main)
  main().catch(() => {
    console.error("resource_benchmark_error=configuration");
    process.exitCode = 1;
  });
