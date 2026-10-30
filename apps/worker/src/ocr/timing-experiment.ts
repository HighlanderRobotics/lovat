import { fusionInputSchema, prepareFusion } from "./fusion-common";
import { fuseOfficialMatch, OFFICIAL_POLICY } from "./fusion-official";

// Deliberately separate from fuseMatch and the queue/API path. These candidates
// are sensitivity measurements, not automatic calibration or production policy.
export function fuseTimingCandidate(
  raw: unknown,
  sources: number[],
  offsetMs: number,
) {
  const input = fusionInputSchema.parse(raw);
  if (input.tba === undefined)
    throw new Error("Timing experiment requires TBA budgets");
  return fuseOfficialMatch(prepareFusion(input, sources, OFFICIAL_POLICY), {
    attributionWindowOffsetMs: offsetMs,
  });
}
