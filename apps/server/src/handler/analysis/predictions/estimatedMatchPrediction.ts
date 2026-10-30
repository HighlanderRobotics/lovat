import { predictEstimatedScores } from "./estimatedScoreProbability.js";
import type { User } from "@lovat/db";
import prisma from "../../../prismaClient.js";
import {
  readEstimatedScoreRows,
  type EstimatedScoreRow as Row,
} from "./estimatedScoreRows.js";

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
  const rows = await readEstimatedScoreRows(user, teams, db);
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
