import { compareReportGroups } from "@lovat/games";
import { boundedBatches } from "./batches.js";
import type { PrismaClient, Prisma } from "@lovat/db";
import type { GamePack, StoredGameReport } from "@lovat/games";
import type { AnalysisRequest } from "@lovat/api";
import type { AccessScope } from "./auth.js";
import { HttpError } from "./errors.js";
export const sourceRule = <T extends string | number>(rule: {
  mode: "INCLUDE" | "EXCLUDE";
  items: T[];
}) => (rule.mode === "INCLUDE" ? { in: rule.items } : { notIn: rule.items });
export async function* streamGameReports(
  db: PrismaClient,
  scope: AccessScope,
  request: AnalysisRequest,
  game: GamePack,
): AsyncGenerator<StoredGameReport> {
  const scopedWhere: Prisma.GameReportWhereInput = {
    seasonYear: request.season,
    gameId: game.descriptor.id,
    gameVersion: game.descriptor.version,
    training: false,
    reliability: { in: ["VERIFIED", "UNVERIFIED"] },
    scouter: { sourceTeamNumber: sourceRule(scope.sources.teams) },
    teamMatchData: {
      teamNumber: { in: [...new Set(request.teams)] },
      matchType: { not: "PRACTICE" },
      tournamentKey: sourceRule(scope.sources.tournaments),
      tournament: { seasonYear: request.season },
    },
  };
  const rows = await db.gameReport.findMany({
    where: scopedWhere,
    select: {
      uuid: true,
      gameId: true,
      gameVersion: true,
      reportVersion: true,
      teamMatchData: {
        select: {
          key: true,
          teamNumber: true,
          tournamentKey: true,
          tournament: { select: { date: true } },
        },
      },
    },
    orderBy: { uuid: "asc" },
    take: 5001,
  });
  if (rows.length > 5000)
    throw new HttpError(
      413,
      "ANALYSIS_TOO_LARGE",
      "Request fewer teams or narrower source tournaments",
    );
  const reports = rows
    .map((row) => ({
      uuid: row.uuid,
      gameId: row.gameId,
      gameVersion: row.gameVersion,
      reportVersion: row.reportVersion,
      teamNumber: row.teamMatchData.teamNumber,
      matchKey: row.teamMatchData.key,
      tournamentKey: row.teamMatchData.tournamentKey,
      tournamentDate: row.teamMatchData.tournament.date ?? "0000-01-01",
    }))
    .sort(compareReportGroups);
  const sizes = reports.length
    ? await db.$queryRaw<
        { uuid: string; bytes: number }[]
      >`SELECT uuid, octet_length("data"::text) AS bytes FROM "GameReport" WHERE uuid=ANY(${reports.map((row) => row.uuid)}::text[])`
    : [];
  if (
    sizes.reduce((sum, row) => sum + row.bytes, 0) > 16 * 1024 * 1024 ||
    sizes.some((row) => row.bytes > 2 * 1024 * 1024)
  )
    throw new HttpError(
      413,
      "ANALYSIS_TOO_LARGE",
      "Request fewer teams or narrower source tournaments",
    );
  const bytes = new Map(sizes.map((row) => [row.uuid, row.bytes]));
  for (const batch of boundedBatches(
    reports,
    (row) => bytes.get(row.uuid) ?? 0,
    250,
    512 * 1024,
  )) {
    const data = await db.gameReport.findMany({
      where: {
        AND: [scopedWhere, { uuid: { in: batch.map((row) => row.uuid) } }],
      },
      select: { uuid: true, data: true },
    });
    const byId = new Map(data.map((row) => [row.uuid, row.data]));
    for (const row of batch)
      if (byId.has(row.uuid)) yield { ...row, data: byId.get(row.uuid) };
  }
}
export async function loadGameReports(
  db: PrismaClient,
  scope: AccessScope,
  request: AnalysisRequest,
  game: GamePack,
): Promise<StoredGameReport[]> {
  const rows: StoredGameReport[] = [];
  for await (const report of streamGameReports(db, scope, request, game))
    rows.push(report);
  return rows;
}
