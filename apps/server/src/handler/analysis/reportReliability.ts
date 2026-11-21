import { reportReliabilityFilter } from "./reportReliabilityFilter.js";

export const analysisReportFilter = {
  training: false,
  ...reportReliabilityFilter,
};

// Static SQL counterpart for analysis queries that aggregate directly in PostgreSQL.
export const analysisReportsSql = `(SELECT * FROM "ScoutReport" WHERE "training" = false AND "reliability" IN ('VERIFIED', 'UNVERIFIED'))`;
