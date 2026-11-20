import type { Prisma } from "@lovat/db";
import { recordRevision } from "../outbox";
export async function flagReportsAboveAllianceScore(
  tx: Prisma.TransactionClient,
  eventKey: string,
) {
  const flagged = await tx.$queryRaw<{ teamNumber: number }[]>`
    UPDATE "ScoutReport" report
    SET "reliability" = 'FLAGGED_SYSTEM'
    FROM "TeamMatchData" slot
    JOIN "Match" match ON match."key" = slot."matchKey"
    JOIN "MatchAlliance" alliance ON alliance."matchKey" = slot."matchKey" AND alliance."color" = slot."alliance"
    WHERE report."teamMatchKey" = slot."key"
      AND slot."tournamentKey" = ${eventKey}
      AND match."status" = 'COMPLETED'
      AND alliance."score" >= 0
      AND report."training" = false
      AND report."reliability" = 'UNVERIFIED'
      AND (
        SELECT COALESCE(SUM(COALESCE(event."quantity", event."points")), 0)
        FROM "Event" event WHERE event."scoutReportUuid" = report."uuid" AND event."action" = 'STOP_SCORING'
      ) > alliance."score"
    RETURNING slot."teamNumber"
  `;
  if (flagged.length) {
    // Keep the old server coherent while replacement traffic is introduced.
    await tx.cachedAnalysis.deleteMany();
    for (const number of new Set(flagged.map((row) => row.teamNumber)))
      await recordRevision(tx, number);
  }
}
