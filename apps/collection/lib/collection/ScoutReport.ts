import { z } from "zod";
import { chargedUpReportSchema } from "./ChargedUp";
import { scoutReportSchema as legacyReportSchema } from "./ScoutReport2026";
// Preserve 2026 offline history without interpreting numeric events as 2023 actions.
export const scoutReportSchema = z.union([
  chargedUpReportSchema,
  legacyReportSchema,
]);
export type ScoutReport = z.infer<typeof scoutReportSchema>;
