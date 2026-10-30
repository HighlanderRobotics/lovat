import { S3Client } from "bun";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, type PrismaClient } from "@lovat/db";
import { z } from "zod";
import { createTbaClient, tbaTournamentSchema } from "../providers/tba";
import { importMatches } from "../jobs/matches";
import { readSourceReports, importSourceReports } from "./report-source";
import { analysisEventAllowed } from "./event-control";
import { runOcrPool } from "./pool";
import { templateSchema, downloadMatchVideo, type Template } from "./media";
import { extractServiceEvidence, OcrServiceUnavailable } from "./service";
import {
  OcrMediaError,
  OcrMediaPending,
  OcrProviderBlocked,
} from "./commandFailure";
import { validateEstimateEvidence, validateObservations } from "./evidence";
import { refreshMatchEstimates } from "./estimate-store";
import standard from "../../config/scoreboard-2026.candidate.json";
import calgames from "../../config/scoreboard-2026-calgames.json";

const videoSchema = z.object({
  videos: z.array(z.object({ type: z.string(), key: z.string() })),
});
export function eventTemplate(eventKey: string): Template {
  const configured = process.env.OCR_EVENT_TEMPLATES
    ? JSON.parse(process.env.OCR_EVENT_TEMPLATES)
    : {};
  return templateSchema.parse(
    configured[eventKey] ?? (eventKey === "2026cacg" ? calgames : standard),
  );
}
function mediaStore() {
  if (!process.env.OCR_MEDIA_ENDPOINT || !process.env.OCR_MEDIA_BUCKET)
    return undefined;
  const endpoint = new URL(process.env.OCR_MEDIA_ENDPOINT);
  endpoint.hostname = `${process.env.OCR_MEDIA_BUCKET}.${endpoint.hostname}`;
  return new S3Client({
    endpoint: endpoint.href,
    virtualHostedStyle: true,
    region: process.env.OCR_MEDIA_REGION ?? "auto",
    accessKeyId: process.env.OCR_MEDIA_ACCESS_KEY_ID,
    secretAccessKey: process.env.OCR_MEDIA_SECRET_ACCESS_KEY,
  });
}
export async function withEventVideo<T>(
  eventKey: string,
  videoKey: string,
  action: (path: string) => Promise<T>,
) {
  if (!analysisEventAllowed(eventKey) || !/^[-\w]{11}$/.test(videoKey))
    throw Error("Invalid media identity");
  const directory = await mkdtemp(join(tmpdir(), "lovat-event-")),
    path = join(directory, "match.mp4");
  try {
    const store = mediaStore(),
      object = store?.file(`media/${eventKey}/${videoKey}.mp4`);
    if (object && (await object.exists())) {
      if ((await object.stat()).size > 96 * 1024 * 1024)
        throw Error("Video exceeds OCR budget");
      await Bun.write(path, object);
    } else {
      await downloadMatchVideo(videoKey, path);
      if ((await stat(path)).size > 96 * 1024 * 1024)
        throw Error("Video exceeds OCR budget");
      if (object) await object.write(Bun.file(path));
    }
    return await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const defaultDependencies = {
  createTbaClient,
  importMatches,
  readSourceReports,
  importSourceReports,
  eventTemplate,
  withEventVideo,
  extractServiceEvidence,
  refreshMatchEstimates,
  hasCachedVideo: async (eventKey: string, video: string) => {
    const object = mediaStore()?.file(`media/${eventKey}/${video}.mp4`);
    return Boolean(object && (await object.exists()));
  },
};
/** Durable ImportJob leases own the run; each match's numeric evidence is its
 * checkpoint. Restarting resumes accepted evidence and recomputes from current
 * reports. No OCR, video staging, or fusion occurs on an operator's computer. */
export async function runEventAnalysis(
  eventKey: string,
  db: PrismaClient,
  overrides: Partial<typeof defaultDependencies> = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const deps = { ...defaultDependencies, ...overrides };
  const concurrency = Number(process.env.OCR_EVENT_CONCURRENCY ?? 2);
  if (![1, 2].includes(concurrency))
    throw Error("Event OCR concurrency must be 1 or 2");
  if (!analysisEventAllowed(eventKey)) throw Error("Event is not enabled");
  if (
    process.env.RAILWAY_ENVIRONMENT_ID !==
    "51f783a8-01c1-4d64-ad5b-11ac94d54c17"
  )
    throw Error(
      "Event analysis is restricted to the PR #95 Railway environment",
    );
  if (!process.env.OCR_SERVICE_URL || !process.env.OCR_SERVICE_TOKEN)
    throw Error("Native OCR service is not configured");
  const tba = deps.createTbaClient(),
    response = await tba.get(`event/${eventKey}`, tbaTournamentSchema);
  if (
    !response.modified ||
    response.data.key !== eventKey ||
    response.data.year !== 2026
  )
    throw Error("Event metadata unavailable");
  const event = response.data;
  await db.season.upsert({
    where: { year: 2026 },
    create: { year: 2026 },
    update: {},
  });
  const data = {
    name: event.name,
    seasonYear: 2026,
    location: event.city,
    date: event.start_date,
    startDate: new Date(event.start_date + "T00:00:00Z"),
    endDate: new Date(event.end_date + "T00:00:00Z"),
    timezone: event.timezone,
    eventType: event.event_type,
    week: event.week ?? null,
    playoffType: event.playoff_type,
  };
  await db.tournament.upsert({
    where: { key: eventKey },
    create: { key: eventKey, ...data },
    update: data,
  });
  await deps.importMatches(eventKey, { db, tba });
  const source = await deps.readSourceReports(eventKey),
    imported = await deps.importSourceReports(db, eventKey, source);
  console.info(
    JSON.stringify({ eventKey, stage: "REPORTS_IMPORTED", ...imported }),
  );
  const sources = [...new Set(source.map((r) => r.sourceTeamNumber))].sort(
    (a, b) => a - b,
  );
  const matches = await db.match.findMany({
    where: { tournamentKey: eventKey, status: "COMPLETED" },
    include: { teamSlots: true, scoreboardOcr: true },
    orderBy: [
      { competitionLevel: "asc" },
      { setNumber: "asc" },
      { matchNumber: "asc" },
    ],
  });
  const template = deps.eventTemplate(eventKey);
  let providerBlocked = false;
  await runOcrPool(
    matches,
    concurrency,
    async (match) => {
      signal?.throwIfAborted();
      const prior = match.scoreboardOcr;
      if (
        prior &&
        ["VALIDATED", "PARTIAL"].includes(prior.status) &&
        [
          template.version,
          ...(template.alternatives ?? []).map((t) => t.version),
        ].includes(prior.templateVersion)
      ) {
        await deps.refreshMatchEstimates(
          db,
          match.key,
          sources.length ? sources : undefined,
        );
        console.info(
          JSON.stringify({
            eventKey,
            matchKey: match.key,
            stage: "REUSED_EVIDENCE",
          }),
        );
        return;
      }
      const linked = await tba.get(`match/${match.key}`, videoSchema);
      if (!linked.modified) throw Error("Match video metadata unavailable");
      const videos = [
        ...new Set(
          linked.data.videos
            .filter((v) => v.type === "youtube" && /^[-\w]{11}$/.test(v.key))
            .map((v) => v.key),
        ),
      ].slice(0, 3);
      const label =
        match.competitionLevel === "QUALIFICATION"
          ? `Qualification ${match.matchNumber}`
          : `${match.competitionLevel} ${match.setNumber} ${match.matchNumber}`;
      let status = videos.length ? "REJECTED" : "NO_VIDEO",
        reason = videos.length
          ? "No validated scoreboard evidence"
          : "No linked supported match video",
        videoKey = videos[0] ?? "",
        observations: unknown[] = [],
        channels: unknown;
      const started = performance.now();
      let profile: unknown, runtime: unknown, frames: number | undefined;
      let layoutVersion = template.version;
      if (match.teamSlots.length !== 6) {
        status = "INVALID_ROSTER";
        reason = "Match needs six canonical team slots";
      } else
        for (const video of videos) {
          videoKey = video;
          status = "REJECTED";
          reason = "No validated scoreboard evidence";
          observations = [];
          channels = undefined;
          profile = runtime = undefined;
          frames = undefined;
          layoutVersion = template.version;
          try {
            if (providerBlocked) {
              // Reuse cached media even when the public provider is rate limiting.
              if (!(await deps.hasCachedVideo(eventKey, video)))
                throw new OcrProviderBlocked(
                  "The video provider blocked the download.",
                );
            }
            const evidence = await deps.withEventVideo(
              eventKey,
              video,
              (path) =>
                deps.extractServiceEvidence(
                  path,
                  match.teamSlots.map((s) => s.teamNumber),
                  label,
                  template,
                  process.env.OCR_SERVICE_URL!,
                  process.env.OCR_SERVICE_TOKEN!,
                ),
            );
            layoutVersion = evidence.layoutVersion;
            profile = evidence.profile;
            runtime = evidence.runtime;
            frames = evidence.frames;
            observations = evidence.observations;
            channels = evidence.channels;
            videoKey = video;
            if (!validateEstimateEvidence(evidence.observations)) continue;
            status = validateObservations(evidence.observations)
              ? "VALIDATED"
              : "PARTIAL";
            reason = "";
            break;
          } catch (error) {
            if (signal?.aborted || error instanceof OcrServiceUnavailable)
              throw error;
            if (error instanceof OcrProviderBlocked) providerBlocked = true;
            status =
              error instanceof OcrProviderBlocked
                ? "MEDIA_BLOCKED"
                : error instanceof OcrMediaPending
                  ? "MEDIA_PENDING"
                  : error instanceof OcrMediaError
                    ? "MEDIA_UNAVAILABLE"
                    : "REJECTED";
            reason =
              error instanceof OcrMediaError
                ? error.message
                : "Video identity, media budget, or scoreboard validation failed";
          }
        }
      signal?.throwIfAborted();
      // Rejections are visible checkpoints, never silently counted as coverage.
      await db.scoreboardOcr.upsert({
        where: { matchKey: match.key },
        create: {
          matchKey: match.key,
          videoKey,
          templateVersion: layoutVersion,
          status,
          reason: reason || null,
          observations: observations as Prisma.InputJsonValue,
          channels: channels
            ? (channels as Prisma.InputJsonValue)
            : Prisma.DbNull,
          analyzeAfter: new Date(),
        },
        update: {
          videoKey,
          templateVersion: layoutVersion,
          status,
          reason: reason || null,
          observations: observations as Prisma.InputJsonValue,
          channels: channels
            ? (channels as Prisma.InputJsonValue)
            : Prisma.DbNull,
          processedAt: new Date(),
          analyzedAt: null,
        },
      });
      await deps.refreshMatchEstimates(
        db,
        match.key,
        sources.length ? sources : undefined,
      );
      console.info(
        JSON.stringify({
          eventKey,
          matchKey: match.key,
          status,
          layoutVersion,
          frames,
          profile,
          runtime,
          elapsedMs: Math.round(performance.now() - started),
          samples: observations.length,
        }),
      );
    },
    () => signal?.aborted ?? false,
  );
  signal?.throwIfAborted();
  if (providerBlocked)
    throw new OcrProviderBlocked("The video provider blocked the download.");
}
