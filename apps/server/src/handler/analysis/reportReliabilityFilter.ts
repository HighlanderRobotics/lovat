import { Prisma, ReportReliability } from "@lovat/db";

export const reportReliabilityFilter = {
  reliability: {
    in: [ReportReliability.VERIFIED, ReportReliability.UNVERIFIED],
  },
} satisfies Prisma.ScoutReportWhereInput;
