import type { Request, Response } from "express";
import type { ScoutReportInProgress } from "@lovat/db";
import z from "zod";
import db from "../../prismaClient.js";

export const timestampSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(
    (value) => Number.isFinite(new Date(value).getTime()),
    "Timestamp must be valid milliseconds since Unix epoch.",
  );

export async function ownedReport(
  req: Request,
  res: Response,
  uuid: string,
): Promise<
  | (ScoutReportInProgress & { trainingSession: { expiresAt: Date } | null })
  | null
> {
  const identity = z
    .object({ code: z.string().min(1), scouterUuid: z.uuid() })
    .safeParse({
      code: req.headers["x-team-code"],
      scouterUuid: req.headers["x-scouter-uuid"],
    });

  if (!identity.success) {
    res
      .status(400)
      .send({ displayError: "A team code and scout UUID are required." });

    return null;
  }

  const team = await db.registeredTeam.findUnique({
    where: { code: identity.data.code },
  });

  if (!team) {
    res.status(401).send({ displayError: "Team code is not correct." });

    return null;
  }

  const scout = await db.scouter.findFirst({
    where: {
      uuid: identity.data.scouterUuid,
      sourceTeamNumber: team.number,
      archived: false,
    },
  });

  if (!scout) {
    res.status(404).send({ displayError: "Scout not found on this team." });

    return null;
  }

  const report = await db.scoutReportInProgress.findFirst({
    where: { uuid, sourceTeamNumber: team.number, scouterUuid: scout.uuid },
    include: { trainingSession: { select: { expiresAt: true } } },
  });

  if (!report) {
    res.status(404).send({ displayError: "Report not found." });

    return null;
  }

  if (
    report.status !== "SUBMITTED" &&
    (report.status === "ABANDONED" ||
      report.expiresAt.getTime() <= Date.now() ||
      (report.mode === "TRAINING" &&
        (!report.trainingSession ||
          report.trainingSession.expiresAt.getTime() <= Date.now())))
  ) {
    res
      .status(410)
      .send({ displayError: "Report or training session expired." });

    return null;
  }

  return report;
}
