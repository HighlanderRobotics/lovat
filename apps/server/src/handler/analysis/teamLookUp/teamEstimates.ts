import z from "zod";
import type { User } from "@lovat/db";
import prisma from "../../../prismaClient.js";
import { createAnalysisHandler } from "../analysisHandler.js";
import { readEstimatedScoreRows } from "../predictions/estimatedScoreRows.js";
import type { EstimatedScoreRow } from "../predictions/estimatedScoreRows.js";

export type TeamEstimateSummary = {
  team: number;
  scoreSource: "combined";
  sampleCount: number;
  archivedSamples: number;
  averagePoints: number | null;
  autoPoints: number | null;
  teleopPoints: number | null;
  averageFuel: number | null;
  scoutAverage: number | null;
  ocrAdjustment: number | null;
  matches: (Pick<
    EstimatedScoreRow,
    | "matchKey"
    | "tournamentKey"
    | "tournamentName"
    | "matchNumber"
    | "setNumber"
    | "competitionLevel"
    | "autoPoints"
    | "teleopPoints"
    | "totalPoints"
    | "totalFuel"
  > & {
    label: string;
    scoutAverage: number | null;
    ocrAdjustment: number | null;
    archived: boolean;
  })[];
};

export async function teamEstimateSummary(
  user: User,
  team: number,
  db: Pick<typeof prisma, "$queryRaw"> = prisma,
): Promise<TeamEstimateSummary> {
  const rows = await readEstimatedScoreRows(user, [team], db);
  const average = (
    key: "totalPoints" | "autoPoints" | "teleopPoints" | "totalFuel",
  ) =>
    rows.length
      ? rows.reduce((sum, row) => sum + row[key], 0) / rows.length
      : null;
  const scoutAverage =
    rows.length &&
    rows.every(
      (row) => row.scoutPoints != null && Number.isFinite(row.scoutPoints),
    )
      ? rows.reduce((sum, row) => sum + row.scoutPoints!, 0) / rows.length
      : null;
  return {
    team,
    scoreSource: "combined" as const,
    sampleCount: rows.length,
    archivedSamples: rows.filter((row) => row.inputOrigin === "ARCHIVE").length,
    averagePoints: average("totalPoints"),
    autoPoints: average("autoPoints"),
    teleopPoints: average("teleopPoints"),
    averageFuel: average("totalFuel"),
    scoutAverage,
    ocrAdjustment:
      scoutAverage === null ? null : average("totalPoints")! - scoutAverage,
    matches: rows
      .map((row) => ({
        matchKey: row.matchKey,
        tournamentKey: row.tournamentKey,
        tournamentName: row.tournamentName,
        label: row.matchKey.split("_").at(-1)!.toUpperCase(),
        matchNumber: row.matchNumber,
        setNumber: row.setNumber,
        competitionLevel: row.competitionLevel,
        autoPoints: row.autoPoints,
        teleopPoints: row.teleopPoints,
        totalPoints: row.totalPoints,
        totalFuel: row.totalFuel,
        scoutAverage: row.scoutPoints,
        ocrAdjustment:
          row.scoutPoints == null ? null : row.totalPoints - row.scoutPoints,
        archived: row.inputOrigin === "ARCHIVE",
      }))
      .sort(
        (a, b) =>
          b.tournamentKey.localeCompare(a.tournamentKey) ||
          (a.competitionLevel === "QUALIFICATION" ? 0 : 1) -
            (b.competitionLevel === "QUALIFICATION" ? 0 : 1) ||
          a.setNumber - b.setNumber ||
          a.matchNumber - b.matchNumber ||
          a.matchKey.localeCompare(b.matchKey),
      ),
  };
}

export const teamEstimates = createAnalysisHandler({
  params: { params: z.object({ team: z.coerce.number().int().positive() }) },
  usesDataSource: true,
  shouldCache: false,
  calculateAnalysis: ({ params }, ctx) =>
    teamEstimateSummary(ctx.user, params.team),
});
