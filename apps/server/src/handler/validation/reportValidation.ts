import type { Response } from "express";
import { z } from "zod";
import db from "../../prismaClient.js";
import type { AuthenticatedRequest } from "../../lib/middleware/requireAuth.js";
import { scoutReportSourceFilter } from "../analysis/scoutReportSourceFilter.js";
import { invalidateCache } from "../../lib/clearCache.js";

export async function getReportValidation(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const report = await db.scoutReport.findFirst({
    where: {
      uuid: String(req.params.uuid),
      ...scoutReportSourceFilter(req.user),
    },
    include: {
      scouter: { select: { sourceTeamNumber: true } },
      validationFlags: { orderBy: { createdAt: "asc" } },
      events: {
        orderBy: { time: "asc" },
        select: {
          eventUuid: true,
          time: true,
          action: true,
          quantity: true,
          analysisExcluded: true,
        },
      },
    },
  });
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json({
    flags: report.validationFlags,
    events: report.events,
    analysisExcluded: report.analysisExcluded,
    canReview:
      req.tokenType !== "apiKey" &&
      req.user.role === "SCOUTING_LEAD" &&
      req.user.teamNumber === report.scouter.sourceTeamNumber,
  });
}

export async function reviewReportValidation(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (
    req.tokenType === "apiKey" ||
    req.user.role !== "SCOUTING_LEAD" ||
    req.user.teamNumber === null
  ) {
    res.status(403).json({ error: "A scouting lead must review strikes" });
    return;
  }
  const body = z
    .object({ status: z.enum(["ACTIVE", "RESTORED"]) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose ACTIVE or RESTORED" });
    return;
  }
  const result = await db.$transaction(async (tx) => {
    const report = await tx.scoutReport.findFirst({
      where: {
        uuid: String(req.params.uuid),
        scouter: { sourceTeamNumber: req.user.teamNumber! },
      },
      include: { teamMatchData: true },
    });
    if (!report) return null;
    // Serialize review decisions on the report to keep derived exclusion flags in sync.
    await tx.$queryRaw`SELECT uuid FROM "ScoutReport" WHERE uuid = ${report.uuid} FOR UPDATE`;
    const flag = await tx.reportValidationFlag.findFirst({
      where: { uuid: String(req.params.flagUuid), reportUuid: report.uuid },
    });
    if (!flag) return null;
    await tx.reportValidationFlag.update({
      where: { uuid: flag.uuid },
      data: {
        status: body.data.status,
        reviewedAt: new Date(),
        reviewedBy: req.user.id,
      },
    });
    const active = await tx.reportValidationFlag.count({
      where: {
        reportUuid: report.uuid,
        eventUuid: flag.eventUuid,
        status: "ACTIVE",
      },
    });
    if (flag.eventUuid)
      await tx.event.update({
        where: { eventUuid: flag.eventUuid, scoutReportUuid: report.uuid },
        data: { analysisExcluded: active > 0 },
      });
    else
      await tx.scoutReport.update({
        where: { uuid: report.uuid },
        data: { analysisExcluded: active > 0 },
      });
    return report.teamMatchData;
  });
  if (!result) {
    res.status(404).json({ error: "Report or flag not found" });
    return;
  }
  await invalidateCache(result.teamNumber, result.tournamentKey);
  res.json({ status: body.data.status });
}
