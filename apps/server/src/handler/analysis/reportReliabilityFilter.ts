import { Prisma, ReportReliability } from "@lovat/db";

export const reportReliabilityFilter = {
  reliability: {
    notIn: [ReportReliability.FLAGGED, ReportReliability.BAD_REPORT],
  },
} satisfies Prisma.ScoutReportWhereInput;
