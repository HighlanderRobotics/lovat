import { S3Client } from "bun";
import { runOcrPool } from "../src/ocr/pool";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { db } from "../src/db";
import { createTbaClient } from "../src/providers/tba";
import {
  extractScoreboard,
  OcrTimelineError,
  templateSchema,
} from "../src/ocr/media";
import {
  validateObservations,
  validateEstimateEvidence,
  estimateCoverage,
} from "../src/ocr/evidence";
import { OcrServiceUnavailable } from "../src/ocr/service";
import { fuseMatch } from "../src/ocr/fusion";

const eventKey = process.env.OCR_BATCH_EVENT ?? "";
const runId = process.env.OCR_BATCH_RUN_ID ?? "";
const sourceTeams = (process.env.OCR_BATCH_SOURCE_TEAMS ?? "")
  .split(",")
  .map(Number);
if (
  !/^2026[a-z0-9]+$/.test(eventKey) ||
  !/^[a-z0-9-]{1,64}$/.test(runId) ||
  !sourceTeams.length ||
  sourceTeams.some((n) => !Number.isSafeInteger(n) || n < 1) ||
  !process.env.OCR_BATCH_ENVIRONMENT_ID ||
  process.env.OCR_BATCH_ENVIRONMENT_ID !== process.env.RAILWAY_ENVIRONMENT_ID ||
  !process.env.OCR_SERVICE_URL
)
  throw new Error(
    "Batch needs an explicit event, run, source-team scope, matching Railway environment, and native service",
  );
const endpoint = new URL(process.env.OCR_MEDIA_ENDPOINT!);
endpoint.hostname = `${process.env.OCR_MEDIA_BUCKET}.${endpoint.hostname}`;
const store = new S3Client({
  endpoint: endpoint.href,
  virtualHostedStyle: true,
  region: process.env.OCR_MEDIA_REGION ?? "auto",
  accessKeyId: process.env.OCR_MEDIA_ACCESS_KEY_ID,
  secretAccessKey: process.env.OCR_MEDIA_SECRET_ACCESS_KEY,
});
const template = templateSchema.parse(
  JSON.parse(process.env.OCR_SCOREBOARD_TEMPLATE!),
);
const provider = createTbaClient();
const matchSchema = z
  .object({
    key: z.string(),
    comp_level: z.string(),
    match_number: z.number(),
    set_number: z.number(),
    videos: z.array(z.object({ type: z.string(), key: z.string() })),
  })
  .passthrough();
const response = await provider.get(
  `event/${eventKey}/matches`,
  z.array(matchSchema),
);
if (!response.modified) throw new Error("TBA event unavailable");
const matches = response.data
  .filter((m) =>
    m.videos.some((v) => v.type === "youtube" && /^[\w-]{11}$/.test(v.key)),
  )
  .sort((a, b) => a.key.localeCompare(b.key));
await db.$queryRaw`SELECT 1`;
let stopped = false;
process.once("SIGTERM", () => {
  stopped = true;
});
process.once("SIGINT", () => {
  stopped = true;
});
const health = Bun.serve({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 8080),
  fetch: () => new Response("ok"),
});
const summary: {
  matchKey: string;
  status: string;
  samples?: number;
  reason?: string;
  elapsedMs?: number;
}[] = [];
const prefix = `runs/${runId}`;
try {
  let checkpoints = Promise.resolve();
  await runOcrPool(
    matches,
    Number(process.env.OCR_BATCH_CONCURRENCY ?? 1),
    async (match) => {
      const output = store.file(`${prefix}/${match.key}.json`);
      if (await output.exists()) {
        const previous = await output.json();
        if (["COMPLETE", "REJECTED"].includes(previous.status)) {
          summary.push(previous.summary);
          console.info(JSON.stringify({ ...previous.summary, resumed: true }));
          return;
        }
      }
      const started = performance.now();
      const directory = await mkdtemp(join(tmpdir(), "lovat-event-batch-"));
      let record: any = { matchKey: match.key, status: "ERROR" };
      try {
        const slots = await db.teamMatchData.findMany({
          where: { matchKey: match.key },
          select: {
            teamNumber: true,
            alliance: true,
            station: true,
            externalParticipantKey: true,
          },
        });
        if (slots.length !== 6)
          throw new Error("Match needs six stored team slots");
        const reports = await db.scoutReport.findMany({
          where: {
            teamMatchData: { matchKey: match.key },
            scouter: { sourceTeamNumber: { in: sourceTeams } },
          },
          select: {
            uuid: true,
            analysisExcluded: true,
            teamMatchData: { select: { teamNumber: true, alliance: true } },
            scouter: { select: { sourceTeamNumber: true } },
            events: {
              select: {
                eventUuid: true,
                time: true,
                action: true,
                quantity: true,
                analysisExcluded: true,
              },
            },
          },
        });
        const videos = match.videos
          .filter((v) => v.type === "youtube" && /^[\w-]{11}$/.test(v.key))
          .slice(0, 2);
        const label =
          match.comp_level === "qm"
            ? `Qualification ${match.match_number}`
            : `${({ ef: "EIGHTHFINAL", qf: "QUARTERFINAL", sf: "SEMIFINAL", f: "FINAL" } as Record<string, string>)[match.comp_level]} ${match.set_number} ${match.match_number}`;
        let evidence: any;
        for (const video of videos) {
          const media = store.file(`media/${eventKey}/${video.key}.mp4`);
          const deadline = Date.now() + 60 * 60000;
          if (!(await media.exists()))
            console.info(
              JSON.stringify({
                matchKey: match.key,
                stage: "WAITING_FOR_STAGED_VIDEO",
              }),
            );
          while (!stopped && !(await media.exists()) && Date.now() < deadline)
            await Bun.sleep(5000);
          if (!(await media.exists())) {
            record.status = "MEDIA_NOT_STAGED";
            continue;
          }
          const stat = await media.stat();
          if (stat.size > 96 * 1024 * 1024)
            throw new Error("Video exceeds OCR budget");
          const path = join(directory, "match.mp4");
          await Bun.write(path, media);
          let observations: any[] = [];
          let rejection: string | undefined;
          for (let retry = 0; retry < 3; retry++) {
            try {
              observations = await extractScoreboard(
                video.key,
                slots.map((s) => s.teamNumber),
                label,
                template,
                { localVideo: path },
              );
              break;
            } catch (error) {
              if (error instanceof OcrServiceUnavailable) {
                if (retry === 2) throw error;
                await Bun.sleep(5000);
                continue;
              }
              if (error instanceof OcrTimelineError) {
                observations = error.observations;
                rejection = error.message;
                break;
              }
              rejection = error instanceof Error ? error.message : "OCR failed";
              break;
            }
          }
          const status = validateObservations(observations)
            ? "VALIDATED"
            : validateEstimateEvidence(observations)
              ? "PARTIAL"
              : "REJECTED";
          evidence = {
            matchKey: match.key,
            videoKey: video.key,
            templateVersion: template.version,
            status,
            observations,
          };
          record = {
            matchKey: match.key,
            status: "REJECTED",
            ocr: evidence,
            coverage: estimateCoverage(observations),
            reason: rejection ?? "Insufficient scoreboard evidence",
          };
          if (status !== "REJECTED") break;
        }
        if (evidence && evidence.status !== "REJECTED") {
          const input = {
            matchKey: match.key,
            tba: match,
            ocr: evidence,
            slots: slots.map((s) => ({
              ...s,
              station: s.station ?? undefined,
              externalParticipantKey: s.externalParticipantKey ?? undefined,
            })),
            reports: reports.map((r) => ({
              uuid: r.uuid,
              analysisExcluded: r.analysisExcluded,
              teamNumber: r.teamMatchData.teamNumber,
              alliance: r.teamMatchData.alliance,
              sourceTeamNumber: r.scouter.sourceTeamNumber,
              events: r.events,
            })),
          };
          record = {
            matchKey: match.key,
            status: "COMPLETE",
            ocr: evidence,
            coverage: estimateCoverage(evidence.observations),
            estimate: fuseMatch(input, sourceTeams),
            reportCount: reports.length,
          };
        }
      } catch (error) {
        record = {
          ...record,
          status: "ERROR",
          reason:
            error instanceof OcrServiceUnavailable
              ? "Native OCR service unavailable"
              : error instanceof Error
                ? error.message
                : "Batch failed",
        };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
      record.summary = {
        matchKey: match.key,
        status: record.status,
        samples: record.ocr?.observations.length,
        reason: record.reason,
        elapsedMs: Math.round(performance.now() - started),
      };
      await output.write(JSON.stringify(record, null, 2));
      summary.push(record.summary);
      console.info(JSON.stringify(record.summary));
      const snapshot = JSON.stringify(
        {
          eventKey,
          runId,
          sourceTeams,
          expected: matches.length,
          processed: summary.length,
          finished: false,
          matches: summary,
        },
        null,
        2,
      );
      checkpoints = checkpoints.then(async () => {
        await store.file(`${prefix}/summary.json`).write(snapshot);
      });
      await checkpoints;
    },
    () => stopped,
  );
  summary.sort((a, b) => a.matchKey.localeCompare(b.matchKey));
  const result = {
    eventKey,
    runId,
    sourceTeams,
    expected: matches.length,
    processed: summary.length,
    finished: summary.length === matches.length,
    matches: summary,
  };
  await store
    .file(`${prefix}/summary.json`)
    .write(JSON.stringify(result, null, 2));
  console.info(
    JSON.stringify({
      eventBatch: runId,
      finished: result.finished,
      processed: summary.length,
      counts: summary.reduce(
        (out, s) => ((out[s.status] = (out[s.status] ?? 0) + 1), out),
        {} as Record<string, number>,
      ),
    }),
  );
  // Keep health available after the one-shot batch; restart resumes checkpoints.
  while (!stopped) await Bun.sleep(1000);
} finally {
  await health.stop(true);
  await db.$disconnect();
}
