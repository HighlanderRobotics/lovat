import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@lovat/db";
import type { GameReportEnvelope } from "@lovat/api";
import type { GamePack } from "@lovat/games";
import { recordAnalysisChange } from "./domain/effects.js";
import { HttpError } from "./errors.js";
export async function writeGameReport(
  tx: Prisma.TransactionClient,
  game: GamePack,
  envelope: GameReportEnvelope,
  matchKey: string,
  sourceTeamNumber: number,
) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${envelope.uuid},0))`;
  if (
    await tx.scoutReport.findUnique({
      where: { uuid: envelope.uuid },
      select: { uuid: true },
    })
  )
    throw new HttpError(
      409,
      "REPORT_ID_CONFLICT",
      "Report UUID is already in use",
    );
  const existing = await tx.gameReport.findUnique({
    where: { uuid: envelope.uuid },
    include: { scouter: { select: { sourceTeamNumber: true } } },
  });
  if (existing) {
    if (
      existing.scouter.sourceTeamNumber !== sourceTeamNumber ||
      existing.scouterUuid !== envelope.scouterUuid
    )
      throw new HttpError(404, "NOT_FOUND", "Report not found");
    if (
      existing.teamMatchKey !== matchKey ||
      existing.gameId !== envelope.gameId ||
      existing.gameVersion !== envelope.gameVersion ||
      existing.seasonYear !== envelope.season ||
      existing.startTime.getTime() !== envelope.startTime ||
      existing.endTime.getTime() !== envelope.endTime ||
      !isDeepStrictEqual(
        game.validate(existing.data, existing.reportVersion),
        game.validate(envelope.data, envelope.reportVersion),
      )
    )
      throw new HttpError(
        409,
        "REPORT_PAYLOAD_CONFLICT",
        "UUID was submitted with different data",
      );
    return false;
  }
  await tx.gameReport.create({
    data: {
      uuid: envelope.uuid,
      scouterUuid: envelope.scouterUuid,
      teamMatchKey: matchKey,
      seasonYear: envelope.season,
      gameId: envelope.gameId,
      gameVersion: envelope.gameVersion,
      reportVersion: envelope.reportVersion,
      startTime: new Date(envelope.startTime),
      endTime: new Date(envelope.endTime),
      data: envelope.data,
      reliability: game.plausible(envelope.data, envelope.reportVersion)
        ? "UNVERIFIED"
        : "FLAGGED_SYSTEM",
    },
  });
  await recordAnalysisChange(tx, envelope.teamNumber);
  return true;
}
