import { fusionInputSchema, prepareFusion, compare } from "./fusion-common";
import { fuseOfficialMatch, OFFICIAL_POLICY } from "./fusion-official";

const POLICY = Object.freeze({
  maximumOffsetMs: 3000,
  offsetStepMs: 500,
  maximumSampleGapMs: 1500,
  maximumBurstMs: 10000,
  minimumFuel: 3,
  minimumBursts: 4,
  maximumSpreadMs: 1000,
  maximumValidationErrorMs: 750,
  minimumValidationGainMs: 500,
});
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
};
const overlap = (a: number, b: number, c: number, d: number) => a < d && c < b;

/** Offline identifiability experiment only. The estimated lag combines reporter,
 * flight/sensor and overlay delay. It cannot prove robot/HP origin and is never
 * used by the queue, API or production fusion policy. */
export function examineReportAlignment(raw: unknown, sourceTeams: number[]) {
  const input = fusionInputSchema.parse(raw);
  if (input.tba === undefined) throw new Error("Report alignment requires official match validation");
  const rawState = prepareFusion(input, sourceTeams, { ...OFFICIAL_POLICY, earlyMs: 0, lateMs: 0 });
  const official = fuseOfficialMatch(prepareFusion(input, sourceTeams, OFFICIAL_POLICY));
  const reports = rawState.prepared.map(({ report, windows }) => {
    const alliance = official.alliances.find(a => a.alliance === report.alliance)!;
    const rejections: Record<string, number> = {};
    const reject = (reason: string) => { rejections[reason] = (rejections[reason] ?? 0) + 1; };
    const bursts: { startMs: number; endMs: number; fuel: number; netLagMs: number }[] = [];
    for (const window of windows) {
      const from = window.start - POLICY.maximumOffsetMs;
      const to = window.end + POLICY.maximumOffsetMs;
      // Avoid fitting to official phase totals, transition arrivals or tail
      // extrapolation. Those cannot independently identify a report's timing.
      const phase = window.end <= 20000 ? [0, 20000] : [27000, 160000];
      if (from < phase[0]! || to > phase[1]! || window.end <= window.start ||
          window.end - window.start > POLICY.maximumBurstMs) {
        reject("phase-boundary-or-duration"); continue;
      }
      const competitors = rawState.prepared.some(other => {
        const sameReport = other.report.uuid === report.uuid;
        // Other reports of this robot are supporting evidence, not competing
        // robots; distinct nearby bursts of the same report still disqualify.
        return other.report.alliance === report.alliance &&
          (other.report.teamNumber !== report.teamNumber || sameReport) &&
          other.windows.some(w => !(sameReport && w === window) &&
            overlap(from, to, w.start - POLICY.maximumOffsetMs, w.end + POLICY.maximumOffsetMs));
      });
      if (competitors) { reject("overlapping-scout-bursts"); continue; }
      const intervals = alliance.intervals.filter(i => overlap(from, to, i.from * 1000, i.to * 1000));
      let covered = from;
      let unreliable = !intervals.length;
      for (const i of intervals) {
        if (i.source !== "OCR" || i.coverage !== "dense" ||
            (i.to - i.from) * 1000 > POLICY.maximumSampleGapMs || i.from * 1000 > covered)
          unreliable = true;
        covered = Math.max(covered, i.to * 1000);
      }
      if (unreliable || covered < to) { reject("missing-sparse-or-corrected-ocr"); continue; }
      const positive = intervals.filter(i => i.observedFuelDelta > 0);
      const fuel = positive.reduce((sum, i) => sum + i.observedFuelDelta, 0);
      if (fuel < POLICY.minimumFuel) { reject("insufficient-positive-fuel"); continue; }
      if (positive[0]!.from * 1000 <= from || positive.at(-1)!.to * 1000 >= to) {
        reject("burst-truncated-by-search-window"); continue;
      }
      const arrivalCenter = positive.reduce((sum, i) =>
        sum + (i.from + i.to) * 500 * i.observedFuelDelta, 0) / fuel;
      const netLagMs = arrivalCenter - (window.start + window.end) / 2;
      if (Math.abs(netLagMs) > POLICY.maximumOffsetMs) { reject("lag-outside-bound"); continue; }
      bursts.push({ startMs: window.start, endMs: window.end, fuel, netLagMs });
    }
    bursts.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    // Chronological alternating bursts: the validation half never chooses the
    // offset. This is internal cross-validation, not independent match truth.
    const fit = bursts.filter((_, i) => i % 2 === 0);
    const validation = bursts.filter((_, i) => i % 2 === 1);
    let candidateOffsetMs: number | null = null;
    let validationErrorMs: number | null = null;
    let validationBaselineErrorMs: number | null = null;
    let status = "insufficient-isolated-bursts";
    if (bursts.length >= POLICY.minimumBursts) {
      const offset = Math.round(median(fit.map(b => b.netLagMs)) / POLICY.offsetStepMs) * POLICY.offsetStepMs;
      const spread = Math.max(...bursts.map(b => Math.abs(b.netLagMs - offset)));
      validationErrorMs = median(validation.map(b => Math.abs(b.netLagMs - offset)));
      validationBaselineErrorMs = median(validation.map(b => Math.abs(b.netLagMs)));
      if (spread > POLICY.maximumSpreadMs) status = "inconsistent-lag";
      else if (offset === 0) status = "already-aligned";
      else if (validationErrorMs > POLICY.maximumValidationErrorMs ||
          validationBaselineErrorMs - validationErrorMs < POLICY.minimumValidationGainMs)
        status = "no-validation-improvement";
      else { status = "candidate-awaiting-independent-validation"; candidateOffsetMs = offset; }
    }
    return { reportUuid: report.uuid, teamNumber: report.teamNumber,
      sourceTeamNumber: report.sourceTeamNumber, alliance: report.alliance,
      status, candidateOffsetMs, validationErrorMs, validationBaselineErrorMs,
      fitBursts: fit.length, validationBursts: validation.length, bursts, rejections };
  }).sort((a, b) => a.teamNumber - b.teamNumber || a.sourceTeamNumber - b.sourceTeamNumber || compare(a.reportUuid, b.reportUuid));
  return { version: "isolated-report-net-lag-experiment-v1", matchKey: input.matchKey,
    sourceTeams: rawState.allowed, policy: POLICY, promoted: false,
    caveat: "Scout isolation does not exclude HP fuel or unreported robot shooting. Net lag combines report, flight, sensor and overlay delays. Internal burst validation is not held-out robot attribution accuracy.",
    reports };
}
