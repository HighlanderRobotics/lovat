import { analyzeGameReports } from "@lovat/games";
import { prepareFacts, type Facts, type ReportInput } from "@lovat/games/2026";
import type { MetricRegistry } from "@lovat/games";
import type { AnalysisRequest } from "@lovat/api";
// Compatibility entrypoint; new game modules use the generic engine directly.
export function analyzeReports(
  reports: readonly ReportInput[],
  request: AnalysisRequest,
  registry: MetricRegistry<Facts>,
) {
  return analyzeGameReports(reports, request, registry, prepareFacts);
}
