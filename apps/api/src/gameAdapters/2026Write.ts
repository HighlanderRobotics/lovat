import type { Prisma } from "@lovat/db";
import type { ReportSubmission, GameReportEnvelope } from "@lovat/api";
import { reportSchema } from "@lovat/api";
import { isDeepStrictEqual } from "node:util";
import {
  normalizeTimeline,
  persistenceData,
  canonicalPayload,
} from "../domain/reports.js";
import { reportEffects } from "../domain/effects.js";
import { HttpError } from "../errors.js";
export async function write2026Report(
  tx: Prisma.TransactionClient,
  report: ReportSubmission,
  actor: { uuid: string; sourceTeamNumber: number },
  match: { key: string; tournament: { seasonYear: number | null } },
  deviceId: string,
  endTime?: number,
) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${report.uuid},0))`;
  if (
    await tx.gameReport.findUnique({
      where: { uuid: report.uuid },
      select: { uuid: true },
    })
  )
    throw new HttpError(
      409,
      "REPORT_ID_CONFLICT",
      "Report UUID is already in use",
    );
  const receipt = await tx.scoutReportInProgress.findUnique({
    where: { uuid: report.uuid },
  });
  if (receipt) {
    if (
      receipt.sourceTeamNumber !== actor.sourceTeamNumber ||
      receipt.scouterUuid !== actor.uuid
    )
      throw new HttpError(404, "NOT_FOUND", "Report not found");
    if (
      receipt.status !== "SUBMITTED" ||
      !isDeepStrictEqual(receipt.payload, canonicalPayload(report)) ||
      (endTime !== undefined &&
        receipt.endedAt !== null &&
        receipt.endedAt.getTime() !== endTime)
    )
      throw new HttpError(
        409,
        "REPORT_PAYLOAD_CONFLICT",
        "UUID was submitted with different data",
      );
    return false;
  }
  await tx.scoutReport.create({ data: persistenceData(report, match.key) });
  await tx.scoutReportInProgress.create({
    data: {
      uuid: report.uuid,
      sourceTeamNumber: actor.sourceTeamNumber,
      scouterUuid: actor.uuid,
      deviceId,
      seasonYear:
        match.tournament.seasonYear ?? Number(report.tournamentKey.slice(0, 4)),
      schemaVersion: 1,
      mode: "COMPETITION",
      status: "SUBMITTED",
      tournamentKey: report.tournamentKey,
      matchType: report.matchType,
      matchNumber: report.matchNumber,
      teamNumber: report.teamNumber,
      payload: canonicalPayload(report),
      startedAt: new Date(report.startTime),
      endedAt: endTime === undefined ? null : new Date(endTime),
      submittedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      finalizedReportUuid: report.uuid,
    },
  });
  await reportEffects(tx, report, actor.sourceTeamNumber);
  return true;
}
export function gameEnvelope2026(
  envelope: GameReportEnvelope,
  data: Record<string, unknown>,
) {
  return normalizeTimeline(
    reportSchema.parse({
      ...data,
      uuid: envelope.uuid,
      scouterUuid: envelope.scouterUuid,
      tournamentKey: envelope.tournamentKey,
      matchType: envelope.matchType,
      matchNumber: envelope.matchNumber,
      teamNumber: envelope.teamNumber,
      startTime: envelope.startTime,
    }),
    (envelope.endTime - envelope.startTime) / 1000,
  );
}
