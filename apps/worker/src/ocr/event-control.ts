import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@lovat/db";

export const eventAnalysisKind = "ocr-event-analysis";
export function analysisEventAllowed(
  key: string,
  configured = process.env.OCR_ANALYSIS_EVENT_KEYS ??
    "2026cacg,2026casnf,2026cagle",
) {
  return (
    /^2026[a-z0-9]+$/.test(key) &&
    configured
      .split(",")
      .map((s) => s.trim())
      .includes(key)
  );
}
export function controlAuthorized(
  header: string | undefined,
  token: string | undefined,
) {
  if (!token || token.length < 32 || !header?.startsWith("Bearer "))
    return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(token));
}
export async function enqueueEventAnalysis(db: PrismaClient, eventKey: string) {
  if (!analysisEventAllowed(eventKey))
    throw new Error("Event is not enabled for OCR analysis");
  const now = new Date();
  const job = await db.importJob.upsert({
    where: { kind_targetKey: { kind: eventAnalysisKind, targetKey: eventKey } },
    create: { kind: eventAnalysisKind, targetKey: eventKey, runAt: now },
    update: {},
  });
  await db.importJob.updateMany({
    where: {
      id: job.id,
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: { runAt: now, attempts: 0, lastError: null },
  });
  return { eventKey, jobId: job.id, status: "QUEUED" };
}
export async function eventAnalysisStatus(db: PrismaClient, eventKey: string) {
  const [job, matches, reports, estimates] = await Promise.all([
    db.importJob.findUnique({
      where: {
        kind_targetKey: { kind: eventAnalysisKind, targetKey: eventKey },
      },
    }),
    db.match.findMany({
      where: { tournamentKey: eventKey, status: "COMPLETED" },
      select: {
        key: true,
        scoreboardOcr: {
          select: {
            status: true,
            reason: true,
            videoKey: true,
            templateVersion: true,
            processedAt: true,
          },
        },
      },
      orderBy: { key: "asc" },
    }),
    db.scoutReport.count({
      where: { teamMatchData: { tournamentKey: eventKey } },
    }),
    db.estimatedScore.count({ where: { match: { tournamentKey: eventKey } } }),
  ]);
  const counts: Record<string, number> = {};
  for (const m of matches) {
    const s = m.scoreboardOcr?.status ?? "PENDING";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const now = Date.now();
  return {
    eventKey,
    status: !job
      ? "NOT_QUEUED"
      : job.leaseExpiresAt && job.leaseExpiresAt.getTime() > now
        ? "RUNNING"
        : job.lastError
          ? "RETRYING"
          : job.runAt.getTime() <= now
            ? "QUEUED"
            : (counts.PENDING ?? 0) > 0
              ? "PARTIAL"
              : matches.length === 0 ||
                  reports === 0 ||
                  estimates === 0 ||
                  Object.keys(counts).some(
                    (s) => !["VALIDATED", "PARTIAL"].includes(s),
                  )
                ? "PARTIAL"
                : "COMPLETE",
    jobId: job?.id ?? null,
    nextRunAt: job?.runAt ?? null,
    errorCode: job?.lastError ?? null,
    matches: matches.length,
    reports,
    warnings: [
      ...(reports === 0 ? ["NO_SCOUT_REPORTS"] : []),
      ...(estimates === 0 ? ["NO_ESTIMATES"] : []),
    ],
    estimateRows: estimates,
    counts,
    results: matches.map((m) => ({ matchKey: m.key, ...m.scoreboardOcr })),
  };
}
