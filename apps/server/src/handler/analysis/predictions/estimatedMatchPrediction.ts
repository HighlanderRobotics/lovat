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
  inputOrigin: string;
  scoutPoints: number | null;
  allianceColor: string | null;
  foulCredit: number | null;
};

type EstimatedAlliance = {
  teams: {
    team: number;
    role: null;
    paths: never[];
    averagePoints: number;
    estimateSamples: number;
    archivedSamples: number;
    scoutAverage: number | null;
    ocrAdjustment: number | null;
  }[];
  totalPoints: number;
  autoPoints: number;
  teleopPoints: number;
  robotPoints: number;
  foulPoints: number | null;
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
    SELECT DISTINCT ON (e."teamNumber", e."matchKey") e.*,
      t.alliance::text AS "allianceColor", a."scoreBreakdown"->'foulPoints' AS "foulCredit"
    FROM "EstimatedScore" e JOIN "Match" m ON m.key = e."matchKey"
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
  const groups = teams.map((team) => rows.filter((r) => r.teamNumber === team));
  const foulSeries = (start: number) => {
    const unique = new Map<string, number>();
    for (const row of groups.slice(start, start + 3).flat()) {
      if (
        row.allianceColor &&
        Number.isFinite(row.foulCredit) &&
        row.foulCredit! >= 0
      )
        unique.set(`${row.matchKey}:${row.allianceColor}`, row.foulCredit!);
    }
    return [...unique.values()];
  };
  const redFouls = foulSeries(0),
    blueFouls = foulSeries(3);
  const prediction = predictEstimatedScores(
    groups.map((g) => g.map((r) => r.totalPoints)),
    [redFouls.length ? redFouls : [0], blueFouls.length ? blueFouls : [0]],
  );
  const average = (
    g: Row[],
    key: "totalPoints" | "autoPoints" | "teleopPoints" | "totalFuel",
  ) => g.reduce((s, r) => s + r[key], 0) / g.length;
  const scoutAverage = (g: Row[]) =>
    g.every((r) => r.scoutPoints != null && Number.isFinite(r.scoutPoints))
      ? g.reduce((sum, r) => sum + r.scoutPoints!, 0) / g.length
      : null;
  const alliance = (start: number): EstimatedAlliance => {
    const foulSamples = start === 0 ? redFouls : blueFouls;
    const foulPoints = foulSamples.length
      ? foulSamples.reduce((sum, n) => sum + n, 0) / foulSamples.length
      : null;
    const robotPoints = groups
      .slice(start, start + 3)
      .reduce((s, g) => s + average(g, "totalPoints"), 0);
    return {
      teams: teams
        .slice(start, start + 3)
        .map((team, i): EstimatedAlliance["teams"][number] => ({
          team,
          role: null,
          paths: [],
          averagePoints: average(groups[start + i], "totalPoints"),
          estimateSamples: groups[start + i].length,
          archivedSamples: groups[start + i].filter(
            (r) => r.inputOrigin === "ARCHIVE",
          ).length,
          scoutAverage: scoutAverage(groups[start + i]),
          ocrAdjustment:
            scoutAverage(groups[start + i]) === null
              ? null
              : average(groups[start + i], "totalPoints") -
                scoutAverage(groups[start + i])!,
        })),
      totalPoints: robotPoints + (foulPoints ?? 0),
      robotPoints,
      foulPoints,
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
    };
  };
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
