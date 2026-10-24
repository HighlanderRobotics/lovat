import { ReportReliability } from "@lovat/db";

export const analysisReportFilter = {
  reliability: {
    in: [ReportReliability.VERIFIED, ReportReliability.UNVERIFIED],
  },
};

// Static SQL counterpart for analysis queries that aggregate directly in PostgreSQL.
export const analysisReportsSql = `(SELECT * FROM "ScoutReport" WHERE "reliability" IN ('VERIFIED', 'UNVERIFIED'))`;
