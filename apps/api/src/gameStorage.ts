import type { PrismaClient } from "@lovat/db";
import type { GamePack, StoredGameReport } from "@lovat/games";
import type { AnalysisRequest } from "@lovat/api";
import type { AccessScope } from "./auth.js";
import { HttpError } from "./errors.js";
export const sourceRule = <T extends string | number>(rule: {
  mode: "INCLUDE" | "EXCLUDE";
  items: T[];
}) => (rule.mode === "INCLUDE" ? { in: rule.items } : { notIn: rule.items });
export async function loadGameReports(
  db: PrismaClient,
  scope: AccessScope,
  request: AnalysisRequest,
  game: GamePack,
): Promise<StoredGameReport[]> {
  const rows = await db.gameReport.findMany({
    where: {
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
    },
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
  const sizes = rows.length
    ? await db.$queryRaw<
        { bytes: bigint }[]
      >`SELECT COALESCE(sum(octet_length("data"::text)),0) AS bytes FROM "GameReport" WHERE uuid=ANY(${rows.map((row) => row.uuid)}::text[])`
    : [];
  if (Number(sizes[0]?.bytes ?? 0) > 16 * 1024 * 1024)
    throw new HttpError(
      413,
      "ANALYSIS_TOO_LARGE",
      "Request fewer teams or narrower source tournaments",
    );
  const data = rows.length
    ? await db.gameReport.findMany({
        where: { uuid: { in: rows.map((row) => row.uuid) } },
        select: { uuid: true, data: true },
      })
    : [];
  const byId = new Map(data.map((row) => [row.uuid, row.data]));
  return rows
    .filter((row) => byId.has(row.uuid))
    .map((row) => ({
      uuid: row.uuid,
      gameId: row.gameId,
      gameVersion: row.gameVersion,
      reportVersion: row.reportVersion,
      data: byId.get(row.uuid),
      teamNumber: row.teamMatchData.teamNumber,
      matchKey: row.teamMatchData.key,
      tournamentKey: row.teamMatchData.tournamentKey,
      tournamentDate: row.teamMatchData.tournament.date ?? "0000-01-01",
    }));
}
