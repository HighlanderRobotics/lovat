import { refreshMatchEstimates } from "../ocr/estimate-store";
import { OcrServiceUnavailable } from "../ocr/service";
import { OcrMediaError, OcrMediaPending } from "../ocr/commandFailure";
import { ocrTournamentAllowed } from "../ocr/config";
import type { PrismaClient, Prisma } from "@lovat/db";
import { z } from "zod";
import {
  templateSchema,
  extractScoreboard,
  OcrTimelineError,
} from "../ocr/media";
import {
  findImpossibleClaims,
  OCR_RULE,
  validateObservations,
  validateEvidence,
  type Observation,
} from "../ocr/evidence";
import type { createTbaClient } from "../providers/tba";

type Dependencies = {
  db: PrismaClient;
  tba: Pick<ReturnType<typeof createTbaClient>, "get">;
  extract?: typeof extractScoreboard;
};
const matchVideos = z.object({
  videos: z.array(z.object({ type: z.string(), key: z.string() })),
});

export async function scanScoreboardTournament(
  eventKey: string,
  { db, tba, extract = extractScoreboard }: Dependencies,
) {
  if (!ocrTournamentAllowed(eventKey)) return;
  const event = await db.tournament.findFirst({
    where: {
      key: eventKey,
      seasonYear: 2026,
      teams: { some: { teamNumber: 8033 } },
    },
    include: {
      matches: {
        where: { status: "COMPLETED" },
        include: { scoreboardOcr: true, teamSlots: true },
        orderBy: { actualTime: "desc" },
      },
    },
  });
  if (!event) return;
  const configured = process.env.OCR_SCOREBOARD_TEMPLATE;
  if (!configured) return; // Deliberate calibration gate; no guessed broadcast geometry.
  const template = templateSchema.parse(JSON.parse(configured));
  // Bound every job's disk/CPU footprint and let other import jobs run.
  const candidates = event.matches.filter(
    (match) =>
      !match.scoreboardOcr ||
      (match.scoreboardOcr.status !== "VALIDATED" &&
        (match.scoreboardOcr.templateVersion !== template.version ||
          Date.now() - match.scoreboardOcr.processedAt.getTime() >
            (match.scoreboardOcr.status === "NO_VIDEO"
              ? 2 * 60000
              : 6 * 3600000))),
  );
  for (const match of candidates.slice(0, 5)) {
    const response = await tba.get(`match/${match.key}`, matchVideos);
    if (!response.modified) continue;
    const videos = response.data.videos
      .filter(
        (video) => video.type === "youtube" && /^[\w-]{11}$/.test(video.key),
      )
      .slice(0, 2);
    const label =
      match.competitionLevel === "QUALIFICATION"
        ? `Qualification ${match.matchNumber}`
        : `${match.competitionLevel} ${match.setNumber} ${match.matchNumber}`;
    const teams = match.teamSlots.map((slot) => slot.teamNumber);
    let status = videos.length ? "REJECTED" : "NO_VIDEO";
    let reason: string | null = videos.length
      ? "Video identity or scoreboard timeline could not be validated. No reports were changed."
      : "TBA has not published a supported match video.";
    let observations: Observation[] = [],
      videoKey = videos[0]?.key ?? "";
    let pendingVideo: { key: string; reason: string } | undefined;
    if (teams.length === 6 && new Set(teams).size === 6) {
      for (const video of videos) {
        try {
          const result = await extract(video.key, teams, label, template);
          if (!validateObservations(result)) continue;
          observations = result;
          videoKey = video.key;
          status = "VALIDATED";
          reason = null;
          break;
        } catch (error) {
          // An occupied/restarting processor is not evidence against a video.
          if (error instanceof OcrServiceUnavailable) throw error;
          if (error instanceof OcrTimelineError) {
            // Sparse evidence is usable only inside dense, monotonic claim windows.
            observations = error.observations;
            reason = error.message;
            videoKey = video.key;
            if (validateEvidence(observations)) {
              status = "PARTIAL";
              break;
            }
          } else if (error instanceof OcrMediaPending) {
            // A published link may precede YouTube finishing its encode. Keep
            // the existing short NO_VIDEO retry instead of caching a rejection
            // for six hours or treating it as evidence against a scout report.
            pendingVideo ??= { key: video.key, reason: error.message };
          } else if (error instanceof OcrMediaError) {
            reason = error.message;
          } else if (
            error instanceof Error &&
            [
              "Match and robot identities could not be validated",
              "Video exceeds OCR budget",
              "OCR exceeded processing budget",
              "OCR frame exceeds memory budget",
            ].includes(error.message)
          ) {
            reason = error.message;
          }
        }
      }
    }
    if (pendingVideo && status !== "VALIDATED" && status !== "PARTIAL") {
      status = "NO_VIDEO";
      videoKey = pendingVideo.key;
      reason = pendingVideo.reason;
      observations = [];
    }
    const data = {
      videoKey,
      templateVersion: template.version,
      status,
      reason,
      observations: observations as Prisma.InputJsonValue,
      processedAt: new Date(),
      analyzeAfter: new Date(
        Math.max(
          Date.now(),
          (match.actualTime?.getTime() ?? Date.now()) + 15 * 60000,
        ),
      ),
      analyzedAt: null,
    };
    await db.scoreboardOcr.upsert({
      where: { matchKey: match.key },
      create: { matchKey: match.key, ...data },
      update: data,
    });
    if (videos.length) break; // At most one match's media per job.
  }
}

export async function analyzeScoreboardTournament(
  eventKey: string,
  db: PrismaClient,
  now = new Date(),
) {
  if (!ocrTournamentAllowed(eventKey)) return;
  const evidence = await db.scoreboardOcr.findMany({
    take: 20,
    orderBy: { analyzedAt: { sort: "asc", nulls: "first" } },
    where: {
      status: { in: ["VALIDATED", "PARTIAL"] },
      analyzeAfter: { lte: now },
      OR: [
        { analyzedAt: null },
        { analyzedAt: { lte: new Date(now.getTime() - 15 * 60000) } },
      ],
      match: { tournamentKey: eventKey },
    },
    include: {
      match: {
        include: {
          teamSlots: {
            include: {
              scoutReports: {
                include: { events: { orderBy: { time: "asc" } } },
              },
            },
          },
        },
      },
    },
  });
  for (const record of evidence) {
    const observations = record.observations as unknown as Observation[];
    if (!validateEvidence(observations)) continue;
    for (const slot of record.match.teamSlots) {
      for (const report of slot.scoutReports) {
        const claims = report.events.flatMap((event, index) => {
          if (event.action !== "STOP_SCORING" || !event.quantity) return [];
          // Require an actual start marker; never infer a cycle start from another robot.
          const start = report.events
            .slice(0, index)
            .findLast(
              (event) =>
                event.action === "START_SCORING" ||
                event.action === "STOP_SCORING",
            );
          if (
            !start ||
            start.action !== "START_SCORING" ||
            event.time < start.time
          )
            return [];
          return [
            {
              eventUuid: event.eventUuid,
              start: start.time,
              end: event.time,
              quantity: event.quantity,
            },
          ];
        });
        for (const claim of findImpossibleClaims(
          observations,
          slot.alliance as "RED" | "BLUE",
          claims,
        )) {
          const rule = `${OCR_RULE}:${claim.eventUuid}`;
          // REVIEW by default until thresholds have been validated on real matches.
          // A lead's restored decision survives all future scans of this event.
          await db.reportValidationFlag.upsert({
            where: { reportUuid_rule: { reportUuid: report.uuid, rule } },
            update: {},
            create: {
              reportUuid: report.uuid,
              eventUuid: claim.eventUuid,
              evidenceMatchKey: record.matchKey,
              rule,
              status: "REVIEW",
              reason: `Recorded ${claim.quantity} fuel, but the whole alliance added ${claim.allianceFuel} in the surrounding window (allowance ${claim.allowance}).`,
              evidence: claim,
            },
          });
        }
      }
    }
    // Mark this review before deriving scores: a later input edit must retain
    // the trigger's queued refresh rather than having its null overwritten.
    await db.scoreboardOcr.update({
      where: { matchKey: record.matchKey },
      data: { analyzedAt: now },
    });
    await refreshMatchEstimates(db, record.matchKey);
  }
}
