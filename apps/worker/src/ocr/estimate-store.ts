import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@lovat/db";
import { fusionInputSchema, prepareFusion } from "./fusion-common";
import { fuseOfficialMatch, OFFICIAL_POLICY } from "./fusion-official";

function validateSourceScope(sourceScope?: number[]) {
  if (
    sourceScope &&
    (!sourceScope.length ||
      sourceScope.length > 100 ||
      sourceScope.some((n) => !Number.isSafeInteger(n) || n <= 0))
  )
    throw new Error("Invalid estimate source scope");
}

/** Rebuild from current database inputs under the same lock as invalidation.
 * Store source scope alongside every row; never present a cross-source estimate
 * to a reader who cannot see every contributing source team. */
export async function refreshMatchEstimates(
  db: PrismaClient,
  matchKey: string,
  sourceScope?: number[],
) {
  validateSourceScope(sourceScope);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${matchKey}, 195))`;
      const match = await tx.match.findUnique({
        where: { key: matchKey },
        include: {
          alliances: true,
          scoreboardOcr: true,
          teamSlots: {
            include: {
              scoutReports: {
                where: sourceScope
                  ? { scouter: { sourceTeamNumber: { in: sourceScope } } }
                  : undefined,
                select: {
                  uuid: true,
                  analysisExcluded: true,
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
              },
            },
          },
        },
      });
      if (
        !match ||
        !matchKey.startsWith("2026") ||
        !match.scoreboardOcr ||
        !["VALIDATED", "PARTIAL"].includes(match.scoreboardOcr.status)
      ) {
        await tx.estimatedScore.deleteMany({
          where: { matchKey, inputOrigin: "LIVE" },
        });
        return 0;
      }
      const reports = match.teamSlots.flatMap((slot) =>
        slot.scoutReports.map((report) => ({
          uuid: report.uuid,
          teamNumber: slot.teamNumber,
          alliance: slot.alliance,
          sourceTeamNumber: report.scouter.sourceTeamNumber,
          analysisExcluded: report.analysisExcluded,
          events: report.events,
        })),
      );
      const sources = [
        ...new Set(
          reports
            .filter((r) => !r.analysisExcluded)
            .map((r) => r.sourceTeamNumber),
        ),
      ].sort((a, b) => a - b);
      if (!sources.length) {
        // An explicitly restored historical estimate can outlive a missing
        // report snapshot. Actual input edits still invalidate it via triggers.
        await tx.estimatedScore.deleteMany({
          where: {
            matchKey,
            inputOrigin: "LIVE",
            ...(sourceScope ? { sourceTeams: { hasSome: sourceScope } } : {}),
          },
        });
        return 0;
      }
      await tx.estimatedScore.deleteMany({ where: { matchKey } });
      if (sources.length > 100) return 0;
      const groups =
        sources.length === 1
          ? [sources]
          : [sources, ...sources.map((n) => [n])];
      const roster = (color: "RED" | "BLUE") =>
        match.teamSlots
          .filter((s) => s.alliance === color)
          .sort((a, b) => (a.station ?? 0) - (b.station ?? 0))
          .map((s) => s.externalParticipantKey ?? `frc${s.teamNumber}`);
      const alliance = (color: "RED" | "BLUE") =>
        match.alliances.find((a) => a.color === color);
      const red = alliance("RED"),
        blue = alliance("BLUE");
      if (!red || !blue || red.score === null || blue.score === null) return 0;
      let count = 0;
      for (const sourceTeams of groups) {
        let estimate: ReturnType<typeof fuseOfficialMatch>;
        try {
          estimate = fuseOfficialMatch(
            prepareFusion(
              fusionInputSchema.parse({
                matchKey,
                slots: match.teamSlots.map((s) => ({
                  teamNumber: s.teamNumber,
                  alliance: s.alliance,
                  station: s.station ?? undefined,
                  externalParticipantKey: s.externalParticipantKey ?? undefined,
                })),
                reports: reports.filter((r) =>
                  sourceTeams.includes(r.sourceTeamNumber),
                ),
                ocr: {
                  ...match.scoreboardOcr,
                  channels: match.scoreboardOcr.channels ?? undefined,
                },
                tba: {
                  key: matchKey,
                  alliances: {
                    red: { team_keys: roster("RED"), score: red.score },
                    blue: { team_keys: roster("BLUE"), score: blue.score },
                  },
                  score_breakdown: {
                    red: red.scoreBreakdown,
                    blue: blue.scoreBreakdown,
                  },
                },
              }),
              sourceTeams,
              OFFICIAL_POLICY,
            ),
          );
        } catch {
          continue;
        } // Unsupported/incomplete official evidence yields no usable estimate.
        if (
          !("officialResultAvailable" in estimate) ||
          !estimate.officialResultAvailable
        )
          continue;
        const scopeKey = createHash("sha256")
          .update(JSON.stringify(sourceTeams))
          .digest("hex");
        const data = estimate.alliances.flatMap((a) =>
          a.teams.map((t) => ({
            matchKey,
            teamNumber: t.teamNumber,
            scopeKey,
            sourceTeams,
            algorithm: estimate.algorithm,
            inputSha256: estimate.semanticInputSha256,
            attributionStatus: estimate.attributionStatus,
            reportCount: t.reports,
            autoFuel: t.autoFuelCount,
            autoPoints: t.autoPoints,
            teleopFuel: t.teleopFuelCount,
            teleopPoints: t.teleopPoints,
            totalFuel: t.estimatedFuel,
            totalPoints: t.estimatedPoints,
          })),
        );
        await tx.estimatedScore.createMany({ data });
        count += data.length;
      }
      return count;
    },
    { timeout: 30000 },
  );
}

/** Batch runs and resumes retain validated numeric evidence in the database,
 * then derive scores from current scoped reports, never a saved score override. */
export async function storeBatchEstimateEvidence(
  db: PrismaClient,
  raw: unknown,
  sourceScope: number[],
) {
  validateSourceScope(sourceScope);
  const evidence = fusionInputSchema.shape.ocr.parse(raw);
  if (!evidence.videoKey || !evidence.templateVersion)
    throw new Error("Evidence provenance missing");
  const { Prisma: runtimePrisma } = await import("@lovat/db");
  const data = {
    videoKey: evidence.videoKey,
    templateVersion: evidence.templateVersion,
    status: evidence.status,
    reason: null,
    observations: evidence.observations as Prisma.InputJsonValue,
    channels: evidence.channels
      ? (evidence.channels as Prisma.InputJsonValue)
      : runtimePrisma.DbNull,
    processedAt: new Date(),
    analyzeAfter: new Date(),
    analyzedAt: null,
  };
  await db.scoreboardOcr.upsert({
    where: { matchKey: evidence.matchKey },
    create: { matchKey: evidence.matchKey, ...data },
    update: data,
  });
  return refreshMatchEstimates(db, evidence.matchKey, sourceScope);
}
