import type { Prisma } from "@lovat/db";

export async function flagReportsAboveAllianceScore(
  tx: Prisma.TransactionClient,
  eventKey: string,
) {
  const flagged = await tx.$executeRaw`
    UPDATE "ScoutReport" report
    SET "reliability" = 'FLAGGED_SYSTEM'
    FROM "TeamMatchData" slot
    JOIN "Match" match ON match."key" = slot."matchKey"
    JOIN "MatchAlliance" alliance
      ON alliance."matchKey" = slot."matchKey" AND alliance."color" = slot."alliance"
    WHERE report."teamMatchKey" = slot."key"
      AND slot."tournamentKey" = ${eventKey}
      AND match."status" = 'COMPLETED'
      AND alliance."score" >= 0
      AND report."reliability" = 'UNVERIFIED'
      AND (
        SELECT COALESCE(SUM(COALESCE(event."quantity", event."points")), 0)
        FROM "Event" event
        WHERE event."scoutReportUuid" = report."uuid"
          AND event."action" = 'STOP_SCORING'
      ) > alliance."score"
  `;

  // Server cache reads check these registrations, so workers need no Redis access.
  if (flagged > 0) await tx.cachedAnalysis.deleteMany();
}
