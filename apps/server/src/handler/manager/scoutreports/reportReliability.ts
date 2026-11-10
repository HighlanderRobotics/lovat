import { ReportReliability } from "@lovat/db";
import { calculateReportTotalPoints } from "../../analysis/reportPoints.js";

export const TOTAL_POINTS_FLAG_THRESHOLD = 800;

export function classifyReportReliability(
  report: Parameters<typeof calculateReportTotalPoints>[0],
): ReportReliability {
  return calculateReportTotalPoints(report) > TOTAL_POINTS_FLAG_THRESHOLD
    ? ReportReliability.FLAGGED_SYSTEM
    : ReportReliability.UNVERIFIED;
}
