import type { Request, Response } from "express";
import z from "zod";
import db from "../../prismaClient.js";
import { ownedReport, timestampSchema } from "./ownedReport.js";

const requestSchema = z.object({ uuid: z.uuid(), startTime: timestampSchema });

export const startMatch = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = requestSchema.safeParse(req.body);

  if (!input.success) {
    res.status(400).send({
      displayError: "A report UUID and startTime in milliseconds are required.",
    });

    return;
  }

  try {
    const report = await ownedReport(req, res, input.data.uuid);

    if (!report) {
      return;
    }

    if (report.startedAt) {
      if (report.startedAt.getTime() !== input.data.startTime) {
        res
          .status(409)
          .send({ displayError: "Report already has a different start time." });

        return;
      }

      res.json({ uuid: report.uuid });

      return;
    }

    const changed = await db.scoutReportInProgress.updateMany({
      where: { uuid: report.uuid, status: "LOADED" },
      data: {
        status: "STARTED",
        startedAt: new Date(input.data.startTime),
        revision: { increment: 1 },
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });

    if (changed.count !== 1) {
      res.status(409).send({
        displayError: "Report is not ready to start. Refresh and retry.",
      });

      return;
    }

    res.json({ uuid: report.uuid });
  } catch (error) {
    console.error("Failed to start match report", error);

    res.status(500).send({ displayError: "Could not start match report." });
  }
};
