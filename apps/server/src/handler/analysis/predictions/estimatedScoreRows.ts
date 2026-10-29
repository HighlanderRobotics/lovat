import type { User } from "@lovat/db";
import z from "zod";
import prisma from "../../../prismaClient.js";
import { dataSourceRuleSchema } from "../dataSourceRule.js";

export type EstimatedScoreRow = {
  matchKey: string;
  tournamentKey: string;
  tournamentName: string;
  matchNumber: number;
  setNumber: number;
  competitionLevel: string;
  teamNumber: number;
  totalPoints: number;
  totalFuel: number;
  autoPoints: number;
  teleopPoints: number;
  calculatedAt: Date;
  attributionStatus: string;
  inputOrigin: string;
  scoutPoints: number | null;
  allianceColor: string | null;
  foulCredit: number | null;
};

export async function readEstimatedScoreRows(
  user: User,
  teams: number[],
  db: Pick<typeof prisma, "$queryRaw"> = prisma,
): Promise<EstimatedScoreRow[]> {
  const sources = dataSourceRuleSchema(z.number()).parse(user.teamSourceRule);
  const tournaments = dataSourceRuleSchema(z.string()).parse(
    user.tournamentSourceRule,
  );
  // Constant SQL with bound arrays keeps source and tournament filtering inside
  // PostgreSQL; no mixed-source result can cross the request's visibility scope.
  return db.$queryRaw<EstimatedScoreRow[]>`
    SELECT DISTINCT ON (e."teamNumber", e."matchKey") e.*, m."tournamentKey", p.name AS "tournamentName", m."matchNumber", m."setNumber", m."competitionLevel"::text,
      t.alliance::text AS "allianceColor", a."scoreBreakdown"->'foulPoints' AS "foulCredit"
    FROM "EstimatedScore" e JOIN "Match" m ON m.key = e."matchKey"
    JOIN "Tournament" p ON p.key=m."tournamentKey"
    LEFT JOIN "TeamMatchData" t ON t."matchKey"=e."matchKey" AND t."teamNumber"=e."teamNumber"
    LEFT JOIN "MatchAlliance" a ON a."matchKey"=e."matchKey" AND a.color=t.alliance
    WHERE e."teamNumber" = ANY(${teams}::integer[]) AND e."reportCount" > 0
      AND cardinality(e."sourceTeams") > 0
      AND ((${sources.mode} = 'INCLUDE' AND e."sourceTeams" <@ ${sources.items}::integer[])
        OR (${sources.mode} = 'EXCLUDE' AND NOT (e."sourceTeams" && ${sources.items}::integer[])))
      AND ((${tournaments.mode} = 'INCLUDE' AND m."tournamentKey" = ANY(${tournaments.items}::text[]))
        OR (${tournaments.mode} = 'EXCLUDE' AND NOT (m."tournamentKey" = ANY(${tournaments.items}::text[]))))
      AND e.algorithm = 'scoreboard-constrained-fusion-v5-tba-consensus'
    ORDER BY e."teamNumber", e."matchKey", cardinality(e."sourceTeams") DESC, e."calculatedAt" DESC, e."scopeKey"
  `;
}
