import prismaClient from "../../../prismaClient.js";
import z from "zod";
import { FlippedActionMap, FlippedPositionMap } from "../analysisConstants.js";
import { createAnalysisHandler } from "../analysisHandler.js";
import { scoutReportSourceFilter } from "../scoutReportSourceFilter.js";

export const timelineForScoutReport = createAnalysisHandler({
  params: {
    params: z.object({
      uuid: z.string(),
    }),
  },
  usesDataSource: false,
  shouldCache: false,
  calculateAnalysis: async ({ params }, ctx) => {
    const events = await prismaClient.event.findMany({
      where: {
        scoutReportUuid: params.uuid,
        scoutReport: scoutReportSourceFilter(ctx.user),
      },
      orderBy: { time: "asc" },
    });
    const timelineArray = [];
    for (const element of events) {
      if (element.points !== 0) {
        timelineArray.push([
          element.time,
          FlippedActionMap[element.action],
          FlippedPositionMap[element.position],
          element.points,
        ]);
      } else {
        timelineArray.push([
          element.time,
          FlippedActionMap[element.action],
          FlippedPositionMap[element.position],
        ]);
      }
    }

    return timelineArray;
  },
});
