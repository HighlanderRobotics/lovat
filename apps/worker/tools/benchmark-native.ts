import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { templateSchema } from "../src/ocr/media";
import { extractServiceEvidence } from "../src/ocr/service";
import { validateEvidence, validateObservations } from "../src/ocr/evidence";

const args = Bun.argv.slice(2);
const option = (name: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const casesFile = option("--cases"),
  templateFile = option("--template"),
  outputPath = option("--output");
const rounds = Number(option("--rounds") ?? "1");
const label = option("--label");
const endpoint = process.env.OCR_SERVICE_URL,
  token = process.env.OCR_SERVICE_TOKEN;
if (
  !casesFile ||
  !templateFile ||
  !outputPath ||
  !label ||
  !endpoint ||
  !token ||
  !Number.isInteger(rounds) ||
  rounds < 1 ||
  rounds > 5
)
  throw new Error(
    "Use --cases JSON --template JSON --output EMPTY_DIR --label NAME [--rounds 1..5], with OCR_SERVICE_URL/TOKEN",
  );
const cases = z
  .array(
    z.object({
      matchKey: z.string().regex(/^[\w-]+$/),
      video: z.string().min(1),
      expectedTeams: z
        .array(z.number().int().positive())
        .length(6)
        .refine((v) => new Set(v).size === 6),
      expectedMatchLabel: z.string().min(1),
    }),
  )
  .min(1)
  .max(37)
  .parse(JSON.parse(await readFile(casesFile, "utf8")));
if (new Set(cases.map((c) => c.matchKey)).size !== cases.length)
  throw new Error("Duplicate benchmark match");
const template = templateSchema.parse(
  JSON.parse(await readFile(templateFile, "utf8")),
);
const output = resolve(outputPath);
await mkdir(output, { recursive: true, mode: 0o700 });
if ((await readdir(output)).length)
  throw new Error("Benchmark output directory must be empty");
const records = [];
for (let round = 1; round <= rounds; round++) {
  for (const c of round % 2 ? cases : [...cases].reverse()) {
    if ((await stat(c.video)).size > 96 * 1024 * 1024)
      throw new Error("Benchmark video exceeds service size limit");
    const mediaSha256 = createHash("sha256")
      .update(await readFile(c.video))
      .digest("hex");
    const started = performance.now();
    const evidence = await extractServiceEvidence(
      c.video,
      c.expectedTeams,
      c.expectedMatchLabel,
      template,
      endpoint,
      token,
    );
    const elapsedMs = performance.now() - started;
    const observationSha256 = createHash("sha256")
      .update(
        JSON.stringify({
          observations: evidence.observations,
          channels: evidence.channels,
          layoutVersion: evidence.layoutVersion,
        }),
      )
      .digest("hex");
    const record = {
      label,
      matchKey: c.matchKey,
      round,
      mediaSha256,
      elapsedMs,
      serviceElapsedMs: evidence.elapsedMs,
      pairedSamples: evidence.observations.length,
      redSamples: evidence.channels?.red.length ?? 0,
      blueSamples: evidence.channels?.blue.length ?? 0,
      complete: validateObservations(evidence.observations),
      usable: validateEvidence(evidence.observations),
      observationSha256,
      evidence,
    };
    records.push(record);
    await writeFile(
      join(output, `${c.matchKey}-round${round}.json`),
      JSON.stringify(record, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        label,
        matchKey: c.matchKey,
        round,
        elapsedMs,
        pairedSamples: record.pairedSamples,
        profile: evidence.profile,
      }),
    );
  }
}
const times = records.map((r) => r.elapsedMs).sort((a, b) => a - b);
const q = (fraction: number) =>
  times[Math.max(0, Math.ceil(times.length * fraction) - 1)]!;
await writeFile(
  join(output, "summary.json"),
  JSON.stringify(
    {
      label,
      cases: cases.length,
      rounds,
      runs: records.length,
      medianMs:
        (times[Math.floor((times.length - 1) / 2)]! +
          times[Math.floor(times.length / 2)]!) /
        2,
      p95Ms: q(0.95),
      meanMs: times.reduce((a, b) => a + b, 0) / times.length,
      templateSha256: createHash("sha256")
        .update(JSON.stringify(template))
        .digest("hex"),
      limitations: [
        "Cached public videos; download time excluded, local upload included.",
        "Stage timings are inclusive wall time; recognition overlaps identity/clock/counter stages and must not be added to them.",
        "Decoder read wait is not decoder CPU time. Small samples do not establish event-wide throughput or accuracy.",
      ],
      records: records.map(({ evidence, ...r }) => r),
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
