import { predictEstimatedScores } from "./estimatedScoreProbability.js";
import type { User } from "@lovat/db";
import z from "zod";
import prisma from "../../../prismaClient.js";
import { dataSourceRuleSchema } from "../dataSourceRule.js";

type Row = {
  matchKey: string;
  teamNumber: number;
  totalPoints: number;
  totalFuel: number;
  autoPoints: number;
  teleopPoints: number;
  calculatedAt: Date;
  attributionStatus: string;
};

type EstimatedAlliance = {
  teams: {
    team: number;
    role: null;
    paths: never[];
    averagePoints: number;
    estimateSamples: number;
  }[];
  totalPoints: number;
  autoPoints: number;
  teleopPoints: number;
  l1StartTime: null[];
  l2StartTime: null[];
  l3StartTime: null[];
  totalFuelOutputted: number;
  totalBallThroughput: null;
};
type EstimatedPrediction = ReturnType<typeof predictEstimatedScores> & {
  red1: number;
  red2: number;
  red3: number;
  blue1: number;
  blue2: number;
  blue3: number;
  redAlliance: EstimatedAlliance;
  blueAlliance: EstimatedAlliance;
  scoreSource: "combined";
};

export async function estimatedMatchPrediction(
  user: User,
  teams: number[],
  db: Pick<typeof prisma, "$queryRaw"> = prisma,
): Promise<EstimatedPrediction> {
  const sources = dataSourceRuleSchema(z.number()).parse(user.teamSourceRule);
  const tournaments = dataSourceRuleSchema(z.string()).parse(
    user.tournamentSourceRule,
  );
  // Constant SQL with bound arrays keeps source and tournament filtering inside
  // PostgreSQL; no mixed-source result can cross the request's visibility scope.
  const rows = await db.$queryRaw<Row[]>`
    SELECT DISTINCT ON (e."teamNumber", e."matchKey") e.*
    FROM "EstimatedScore" e JOIN "Match" m ON m.key = e."matchKey"
    WHERE e."teamNumber" = ANY(${teams}::integer[]) AND e."reportCount" > 0
      AND cardinality(e."sourceTeams") > 0
      AND ((${sources.mode} = 'INCLUDE' AND e."sourceTeams" <@ ${sources.items}::integer[])
        OR (${sources.mode} = 'EXCLUDE' AND NOT (e."sourceTeams" && ${sources.items}::integer[])))
      AND ((${tournaments.mode} = 'INCLUDE' AND m."tournamentKey" = ANY(${tournaments.items}::text[]))
        OR (${tournaments.mode} = 'EXCLUDE' AND NOT (m."tournamentKey" = ANY(${tournaments.items}::text[]))))
      AND e.algorithm = 'scoreboard-constrained-fusion-v5-tba-consensus'
    ORDER BY e."teamNumber", e."matchKey", cardinality(e."sourceTeams") DESC, e."calculatedAt" DESC, e."scopeKey"
  `;
  const groups = teams.map((team) => rows.filter((r) => r.teamNumber === team));
  const prediction = predictEstimatedScores(
    groups.map((g) => g.map((r) => r.totalPoints)),
  );
  const average = (
    g: Row[],
    key: "totalPoints" | "autoPoints" | "teleopPoints" | "totalFuel",
  ) => g.reduce((s, r) => s + r[key], 0) / g.length;
  const alliance = (start: number): EstimatedAlliance => ({
    teams: teams
      .slice(start, start + 3)
      .map((team, i): EstimatedAlliance["teams"][number] => ({
        team,
        role: null,
        paths: [],
        averagePoints: average(groups[start + i], "totalPoints"),
        estimateSamples: groups[start + i].length,
      })),
    totalPoints: groups
      .slice(start, start + 3)
      .reduce((s, g) => s + average(g, "totalPoints"), 0),
    autoPoints: groups
      .slice(start, start + 3)
      .reduce((s, g) => s + average(g, "autoPoints"), 0),
    teleopPoints: groups
      .slice(start, start + 3)
      .reduce((s, g) => s + average(g, "teleopPoints"), 0),
    l1StartTime: [null, null, null],
    l2StartTime: [null, null, null],
    l3StartTime: [null, null, null],
    totalFuelOutputted: groups
      .slice(start, start + 3)
      .reduce((s, g) => s + average(g, "totalFuel"), 0),
    totalBallThroughput: null,
  });
  return {
    red1: teams[0],
    red2: teams[1],
    red3: teams[2],
    blue1: teams[3],
    blue2: teams[4],
    blue3: teams[5],
    ...prediction,
    redAlliance: alliance(0),
    blueAlliance: alliance(3),
    scoreSource: "combined",
  };
}
