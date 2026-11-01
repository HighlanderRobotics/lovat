import type { Request, Response } from "express";
import z from "zod";
import db from "../../prismaClient.js";
import { ownedReport, timestampSchema } from "./ownedReport.js";

const requestSchema = z.object({ uuid: z.uuid(), endTime: timestampSchema });

export const endMatch = async (req: Request, res: Response): Promise<void> => {
  const input = requestSchema.safeParse(req.body);

  if (!input.success) {
    res.status(400).send({
      displayError: "A report UUID and endTime in milliseconds are required.",
    });

    return;
  }

  try {
    const report = await ownedReport(req, res, input.data.uuid);

    if (!report) {
      return;
    }

    if (!report.startedAt || input.data.endTime < report.startedAt.getTime()) {
      res
        .status(409)
        .send({ displayError: "Report must start before it can end." });

      return;
    }

    if (report.endedAt) {
      if (report.endedAt.getTime() !== input.data.endTime) {
        res
          .status(409)
          .send({ displayError: "Report already has a different end time." });

        return;
      }

      res.json({ uuid: report.uuid });

      return;
    }

    const changed = await db.scoutReportInProgress.updateMany({
      where: { uuid: report.uuid, status: "STARTED" },
      data: {
        status: "ENDED",
        endedAt: new Date(input.data.endTime),
        revision: { increment: 1 },
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });

    if (changed.count !== 1) {
      res.status(409).send({
        displayError: "Report is not ready to end. Refresh and retry.",
      });

      return;
    }

    res.json({ uuid: report.uuid });
  } catch (error) {
    console.error("Failed to end match report", error);

    res.status(500).send({ displayError: "Could not end match report." });
  }
};
