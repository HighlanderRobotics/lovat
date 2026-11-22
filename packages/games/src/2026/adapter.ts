import { game2026 } from "./index.js";
import { prepareFacts, type ReportInput } from "./facts.js";
import type { StoredGameReport } from "../pack.js";

/** Read typed legacy columns directly, without constructing a second wire payload. */
export function legacyAnalysisInput(report: ReportInput): StoredGameReport {
  return game2026.fromFacts(report, () => prepareFacts(report));
}
