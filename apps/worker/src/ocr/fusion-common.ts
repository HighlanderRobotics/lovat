import { z } from "zod";
import { channelsSchema } from "./service";

const alliance = z.enum(["RED", "BLUE"]);
const eventSchema = z.object({
  eventUuid: z.string().min(1),
  time: z.number().finite().min(0).max(600),
  action: z.string(),
  quantity: z.number().int().min(0).max(10000).nullable().optional(),
  analysisExcluded: z.boolean().default(false),
});
const reportSchema = z.object({
  uuid: z.string().min(1),
  teamNumber: z.number().int().positive(),
  alliance,
  sourceTeamNumber: z.number().int().positive(),
  analysisExcluded: z.boolean().default(false),
  events: z.array(eventSchema).max(5000),
  scoutPoints: z.number().finite().nonnegative().nullable().optional(),
});
export const fusionInputSchema = z.object({
  matchKey: z.string().min(1).max(80),
  slots: z
    .array(
      z.object({
        teamNumber: z.number().int().positive(),
        alliance,
        station: z.number().int().min(1).max(3).optional(),
        externalParticipantKey: z.string().optional(),
      }),
    )
    .length(6),
  reports: z.array(reportSchema).max(1000),
  tba: z.unknown().optional(),
  ocr: z.object({
    channels: channelsSchema.optional(),
    matchKey: z.string(),
    status: z.enum(["VALIDATED", "PARTIAL"]),
    videoKey: z.string().optional(),
    templateVersion: z.string().optional(),
    observations: z
      .array(
        z.object({
          time: z.number().finite().min(0).max(163),
          red: z.number().int().min(0).max(9999),
          blue: z.number().int().min(0).max(9999),
          confidence: z.number().finite().min(0).max(100),
          redPoints: z.number().int().min(0).max(9999).optional(),
          bluePoints: z.number().int().min(0).max(9999).optional(),
          pointsConfidence: z.number().finite().min(0).max(100).optional(),
        }),
      )
      .max(600),
  }),
});
export type FusionInput = z.input<typeof fusionInputSchema>;
export type Report = z.infer<typeof reportSchema>;
export type Window = { start: number; end: number; quantity: number };
export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
// Fixed, versioned policy; no match-specific tuning, learned weights, or randomness.
export const LEGACY_POLICY = Object.freeze({
  minimumConfidence: 85,
  earlyMs: 1000,
  lateMs: 5000,
  weightScale: 1000000,
  fuelPoints: 1,
});

function windows(
  report: Report,
  diagnostics: { unmatchedStarts: number; unmatchedStops: number },
  policy: TimingPolicy,
): Window[] {
  const events = [...report.events].sort(
    (a, b) =>
      a.time - b.time ||
      (a.action === "START_SCORING" ? 0 : 1) -
        (b.action === "START_SCORING" ? 0 : 1) ||
      compare(a.eventUuid, b.eventUuid),
  );
  let open: number | undefined;
  const result: Window[] = [];
  const seen = new Map<string, string>();
  for (const event of events) {
    const encoded = JSON.stringify(event);
    const previous = seen.get(event.eventUuid);
    if (previous !== undefined) {
      if (previous !== encoded) throw new Error("Conflicting event UUID");
      continue;
    }
    seen.set(event.eventUuid, encoded);
    if (event.action !== "START_SCORING" && event.action !== "STOP_SCORING")
      continue;
    if (event.analysisExcluded) {
      open = undefined;
      continue;
    }
    const time = Math.round(event.time * 1000);
    if (event.action === "START_SCORING") {
      if (open !== undefined) diagnostics.unmatchedStarts++;
      open = time;
      continue;
    }
    if (open === undefined) {
      diagnostics.unmatchedStops++;
      continue;
    }
    if (event.quantity && time >= open)
      result.push({
        start: Math.max(0, open - policy.earlyMs),
        end: time + policy.lateMs,
        quantity: event.quantity,
      });
    open = undefined;
  }
  if (open !== undefined) diagnostics.unmatchedStarts++;
  return result;
}

// Hamilton / largest-remainder apportionment: integers sum exactly to the
// observed counter change. Numeric team order breaks exact ties explicitly.
export function apportion(
  total: number,
  weights: { teamNumber: number; weight: number }[],
) {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Invalid point budget");
  const sorted = [...weights].sort((a, b) => a.teamNumber - b.teamNumber);
  if (sorted.some((w) => !Number.isSafeInteger(w.weight) || w.weight < 0))
    throw new Error("Invalid attribution weight");
  const sum = sorted.reduce((n, w) => n + BigInt(w.weight), 0n);
  if (sum === 0n)
    return {
      teams: sorted.map((w) => ({ teamNumber: w.teamNumber, points: 0 })),
      unattributed: total,
    };
  const shares = sorted.map((w) => {
    const numerator = BigInt(total) * BigInt(w.weight);
    return {
      teamNumber: w.teamNumber,
      points: Number(numerator / sum),
      remainder: numerator % sum,
    };
  });
  let left = total - shares.reduce((n, w) => n + w.points, 0);
  const order = [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.teamNumber - b.teamNumber
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const share of order) {
    if (left === 0) break;
    share.points++;
    left--;
  }
  return {
    teams: shares.map(({ teamNumber, points }) => ({ teamNumber, points })),
    unattributed: 0,
  };
}

export type TimingPolicy = {
  minimumConfidence: number;
  earlyMs: number;
  lateMs: number;
  weightScale: number;
};
export function prepareFusion(
  input: z.infer<typeof fusionInputSchema>,
  sourceTeams: number[],
  policy: TimingPolicy,
) {
  const allowed = [...new Set(sourceTeams)].sort((a, b) => a - b);
  if (
    !allowed.length ||
    allowed.some((n) => !Number.isSafeInteger(n) || n <= 0)
  )
    throw new Error("Explicit source-team scope required");
  if (input.ocr.matchKey !== input.matchKey)
    throw new Error("OCR match identity mismatch");
  const slots = [...input.slots].sort((a, b) => a.teamNumber - b.teamNumber);
  if (
    new Set(slots.map((s) => s.teamNumber)).size !== 6 ||
    slots.filter((s) => s.alliance === "RED").length !== 3
  )
    throw new Error("Expected three distinct robots per alliance");
  const diagnostics = {
    excludedReports: 0,
    outOfScopeReports: 0,
    duplicateReports: 0,
    unmatchedStarts: 0,
    unmatchedStops: 0,
    lowConfidenceSamples: 0,
  };
  const reportIds = new Map<string, string>();
  const signatures = new Set<string>();
  const prepared: { report: Report; windows: Window[] }[] = [];
  for (const report of [...input.reports].sort(
    (a, b) =>
      a.teamNumber - b.teamNumber ||
      a.sourceTeamNumber - b.sourceTeamNumber ||
      compare(a.uuid, b.uuid),
  )) {
    if (!allowed.includes(report.sourceTeamNumber)) {
      diagnostics.outOfScopeReports++;
      continue;
    }
    const slot = slots.find((s) => s.teamNumber === report.teamNumber);
    if (!slot || slot.alliance !== report.alliance)
      throw new Error("Report robot/alliance does not match roster");
    if (report.analysisExcluded) {
      diagnostics.excludedReports++;
      continue;
    }
    const normalized = {
      ...report,
      events: [...report.events].sort(
        (a, b) => a.time - b.time || compare(a.eventUuid, b.eventUuid),
      ),
    };
    const encoded = JSON.stringify(normalized);
    const prior = reportIds.get(report.uuid);
    if (prior !== undefined) {
      if (prior !== encoded) throw new Error("Conflicting report UUID");
      diagnostics.duplicateReports++;
      continue;
    }
    reportIds.set(report.uuid, encoded);
    const cycles = windows(report, diagnostics, policy);
    const signature = JSON.stringify([
      report.teamNumber,
      report.sourceTeamNumber,
      cycles,
    ]);
    if (signatures.has(signature)) {
      diagnostics.duplicateReports++;
      continue;
    }
    signatures.add(signature);
    prepared.push({ report, windows: cycles });
  }
  const samples = [] as typeof input.ocr.observations;
  const corrections: {
    from: number;
    to: number;
    discardedTimestamps: number[];
  }[] = [];
  for (const sample of [...input.ocr.observations].sort(
    (a, b) => a.time - b.time || compare(JSON.stringify(a), JSON.stringify(b)),
  )) {
    if (sample.confidence < policy.minimumConfidence) {
      diagnostics.lowConfidenceSamples++;
      continue;
    }
    const previous = samples.at(-1);
    if (previous && sample.time === previous.time) {
      if (JSON.stringify(previous) !== JSON.stringify(sample))
        throw new Error("Conflicting OCR timestamps");
      continue;
    }
    if (
      previous &&
      (sample.red < previous.red || sample.blue < previous.blue)
    ) {
      if (input.tba === undefined)
        throw new Error("Scoreboard fuel correction requires review");
      const discardedTimestamps: number[] = [];
      while (
        samples.length &&
        (sample.red < samples.at(-1)!.red || sample.blue < samples.at(-1)!.blue)
      )
        discardedTimestamps.push(samples.pop()!.time);
      corrections.push({
        from: samples.at(-1)?.time ?? 0,
        to: sample.time,
        discardedTimestamps: discardedTimestamps.sort((a, b) => a - b),
      });
    }
    samples.push(sample);
  }
  if (samples.length < 2)
    throw new Error("At least two confident scoreboard observations required");
  return { input, allowed, slots, diagnostics, prepared, samples, corrections };
}
export type Prepared = ReturnType<typeof prepareFusion>;
export function consensusWeight(
  prepared: Prepared["prepared"],
  scale: number,
  teamNumber: number,
  from: number,
  to: number,
  phase?: { from: number; to: number; scoreboardLagMs: number },
) {
  const reports = prepared.filter((r) => r.report.teamNumber === teamNumber);
  const sources = [
    ...new Set(reports.map((r) => r.report.sourceTeamNumber)),
  ].sort((a, b) => a - b);
  if (!sources.length) return 0;
  const sourceWeights = sources.map((source) => {
    const votes = reports
      .filter((r) => r.report.sourceTeamNumber === source)
      .map((r) =>
        r.windows.reduce((sum, w) => {
          let lower = w.start,
            upper = w.end;
          if (phase) {
            const physicalEnd = w.end - phase.scoreboardLagMs;
            if (physicalEnd < phase.from || w.start > phase.to) return sum;
            lower = Math.max(w.start, phase.from);
            upper = Math.min(physicalEnd, phase.to) + phase.scoreboardLagMs;
          }
          const overlap = Math.max(
            0,
            Math.min(to, upper) - Math.max(from, lower),
          );
          return (
            sum +
            Math.round(
              (w.quantity * overlap * scale) / Math.max(1, w.end - w.start),
            )
          );
        }, 0),
      );
    return Math.round(votes.reduce((sum, w) => sum + w, 0) / votes.length);
  });
  return Math.round(
    sourceWeights.reduce((sum, w) => sum + w, 0) / sources.length,
  );
}

// A source with many submitted reports still gets one vote. Explicit no-score
// reports participate, so one disputed claim cannot become a full robot credit
// merely because all positive weights are normalized back to the scoreboard.
export function phaseConsensus(
  prepared: Prepared["prepared"],
  teamNumber: number,
  scale: number,
  phase: { from: number; to: number; earlyMs: number; lateMs: number },
) {
  const reports = prepared.filter((r) => r.report.teamNumber === teamNumber);
  const sources = [
    ...new Set(reports.map((r) => r.report.sourceTeamNumber)),
  ].sort((a, b) => a - b);
  const votes = sources.map((sourceTeamNumber) => {
    const sourceReports = reports.filter(
      (r) => r.report.sourceTeamNumber === sourceTeamNumber,
    );
    // The report itself must claim scoring in this phase. Display/arrival
    // padding can keep a score eligible, but cannot certify another phase.
    const positive = sourceReports.filter((r) =>
      r.windows.some(
        (w) =>
          w.end - phase.lateMs >= phase.from &&
          w.start + phase.earlyMs <= phase.to,
      ),
    ).length;
    return {
      sourceTeamNumber,
      reports: sourceReports.length,
      positiveReports: positive,
      support: Math.round((positive * scale) / sourceReports.length),
    };
  });
  const support = votes.length
    ? Math.round(votes.reduce((n, v) => n + v.support, 0) / votes.length)
    : 0;
  return { support, scale, eligible: support > scale / 2, sources: votes };
}
