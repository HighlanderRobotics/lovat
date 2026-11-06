import { Response } from "express";
import z from "zod";
import { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";
import prismaClient from "../../../prismaClient.js";
import { scoutReportSourceFilter } from "../../analysis/scoutReportSourceFilter.js";
import { ReportReliability } from "@lovat/db";
import { invalidateCache } from "../../../lib/clearCache.js";

const FLAG_THRESHOLD = 2;

const getReportReliability = (
  current: ReportReliability,
  flagCount: number,
): ReportReliability => {
  if (
    current === ReportReliability.VERIFIED ||
    current === ReportReliability.BAD_REPORT
  ) {
    return current;
  }

  return flagCount > FLAG_THRESHOLD
    ? ReportReliability.FLAGGED
    : ReportReliability.UNVERIFIED;
};

export const setScoutReportFlag = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const params = z
      .object({
        report: z.string().min(1),
        flag: z.enum(["true", "false"]),
      })
      .safeParse({
        report: req.params.report,
        flag: req.query.flag,
      });

    if (!params.success) {
      res.status(400).send(params.error);
      return;
    }

    const shouldFlag = params.data.flag === "true";

    const report = await prismaClient.scoutReport.findFirst({
      where: {
        uuid: params.data.report,
        ...scoutReportSourceFilter(req.user),
      },
      include: {
        teamMatchData: true,
      },
    });

    if (!report) {
      res.status(404).send("Cannot find scout report");
      return;
    }

    const updatedReport = await prismaClient.$transaction(async (tx) => {
      // Serialize flag changes for this report before changing or counting votes.
      await tx.$queryRaw`
        SELECT "uuid" FROM "ScoutReport"
        WHERE "uuid" = ${report.uuid}
        FOR UPDATE
      `;

      const flaggedReport = await tx.scoutReport.update({
        where: {
          uuid: report.uuid,
        },
        data: {
          flaggedBy: shouldFlag
            ? { connect: { id: req.user.id } }
            : { disconnect: { id: req.user.id } },
        },
        include: {
          _count: {
            select: {
              flaggedBy: true,
            },
          },
        },
      });

      const reliability = getReportReliability(
        flaggedReport.reliability,
        flaggedReport._count.flaggedBy,
      );

      if (reliability !== flaggedReport.reliability) {
        await tx.scoutReport.update({
          where: { uuid: report.uuid },
          data: { reliability },
        });
      }

      return flaggedReport;
    });

    await invalidateCache(
      report.teamMatchData.teamNumber,
      report.teamMatchData.tournamentKey,
    );

    res.status(200).json({
      flagged: shouldFlag,
      flagCount: updatedReport._count.flaggedBy,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
};
