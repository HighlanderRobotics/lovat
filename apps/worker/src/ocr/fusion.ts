import { createHash } from "node:crypto";
import { z } from "zod";

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
});
export const fusionInputSchema = z.object({
  matchKey: z.string().min(1).max(80),
  slots: z
    .array(z.object({ teamNumber: z.number().int().positive(), alliance }))
    .length(6),
  reports: z.array(reportSchema).max(1000),
  ocr: z.object({
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
type Report = z.infer<typeof reportSchema>;
type Window = { start: number; end: number; quantity: number };
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const VERSION = "scoreboard-constrained-fusion-v1";
// Fixed, versioned policy; no match-specific tuning, learned weights, or randomness.
const POLICY = Object.freeze({
  minimumConfidence: 85,
  earlyMs: 1000,
  lateMs: 5000,
  weightScale: 1000000,
  fuelPoints: 1,
});

function windows(
  report: Report,
  diagnostics: { unmatchedStarts: number; unmatchedStops: number },
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
        start: Math.max(0, open - POLICY.earlyMs),
        end: time + POLICY.lateMs,
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

export function fuseMatch(raw: unknown, sourceTeams: number[]) {
  const input = fusionInputSchema.parse(raw);
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
    const cycles = windows(report, diagnostics);
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
  for (const sample of [...input.ocr.observations].sort(
    (a, b) => a.time - b.time || compare(JSON.stringify(a), JSON.stringify(b)),
  )) {
    if (sample.confidence < POLICY.minimumConfidence) {
      diagnostics.lowConfidenceSamples++;
      continue;
    }
    const previous = samples.at(-1);
    if (previous && sample.time === previous.time) {
      if (JSON.stringify(previous) !== JSON.stringify(sample))
        throw new Error("Conflicting OCR timestamps");
      continue;
    }
    if (previous && (sample.red < previous.red || sample.blue < previous.blue))
      throw new Error("Scoreboard fuel correction requires review");
    samples.push(sample);
  }
  if (samples.length < 2)
    throw new Error("At least two confident scoreboard observations required");
  const scores = samples.filter(
    (s) =>
      s.redPoints !== undefined &&
      s.bluePoints !== undefined &&
      (s.pointsConfidence ?? 0) >= POLICY.minimumConfidence,
  );
  if (!scores.length)
    throw new Error(
      "Total-score OCR is missing; extract the scoreboard point digits first",
    );
  for (let i = 1; i < scores.length; i++)
    if (
      scores[i]!.redPoints! < scores[i - 1]!.redPoints! ||
      scores[i]!.bluePoints! < scores[i - 1]!.bluePoints!
    )
      throw new Error("Scoreboard point correction requires review");
  const endpoint = scores.at(-1)!;
  const used = samples.filter((s) => s.time <= endpoint.time);
  const intervalWeights = (teamNumber: number, from: number, to: number) => {
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
            const overlap = Math.max(
              0,
              Math.min(to, w.end) - Math.max(from, w.start),
            );
            return (
              sum +
              Math.round(
                (w.quantity * overlap * POLICY.weightScale) /
                  Math.max(1, w.end - w.start),
              )
            );
          }, 0),
        );
      return Math.round(votes.reduce((sum, w) => sum + w, 0) / votes.length);
    });
    return Math.round(
      sourceWeights.reduce((sum, w) => sum + w, 0) / sources.length,
    );
  };
  const alliances = (["RED", "BLUE"] as const).map((color) => {
    const fuelKey = color === "RED" ? "red" : "blue";
    const scoreKey = color === "RED" ? "redPoints" : "bluePoints";
    const observedFuel = endpoint[fuelKey];
    const scoreboardPoints = endpoint[scoreKey]!;
    if (scoreboardPoints < observedFuel * POLICY.fuelPoints)
      throw new Error("Scoreboard points contradict the scored-fuel counter");
    const robots = slots
      .filter((s) => s.alliance === color)
      .map((s) => ({
        teamNumber: s.teamNumber,
        estimatedFuelMicros: 0,
        estimatedFuel: 0,
        estimatedPoints: 0,
        reports: prepared.filter((r) => r.report.teamNumber === s.teamNumber)
          .length,
        sourceTeams: [
          ...new Set(
            prepared
              .filter((r) => r.report.teamNumber === s.teamNumber)
              .map((r) => r.report.sourceTeamNumber),
          ),
        ].sort((a, b) => a - b),
      }));
    const intervals = [];
    let previous = { time: 0, fuel: 0 };
    let unattributedFuel = 0;
    for (const sample of used) {
      const delta = sample[fuelKey] - previous.fuel;
      const from = Math.round(previous.time * 1000),
        to = Math.round(sample.time * 1000);
      const weights = robots.map((r) => ({
        teamNumber: r.teamNumber,
        weight: intervalWeights(r.teamNumber, from, to),
      }));
      const allocation = apportion(delta * POLICY.weightScale, weights);
      for (const robot of robots) {
        robot.estimatedFuelMicros += allocation.teams.find(
          (t) => t.teamNumber === robot.teamNumber,
        )!.points;
      }
      unattributedFuel += allocation.unattributed / POLICY.weightScale;
      intervals.push({
        from: previous.time,
        to: sample.time,
        observedFuelDelta: delta,
        coverage: sample.time - previous.time > 3 ? "sparse" : "dense",
        supportingTeams: weights
          .filter((w) => w.weight > 0)
          .map((w) => w.teamNumber),
        allocation: allocation.teams.map((t) => ({
          teamNumber: t.teamNumber,
          fuelMicros: t.points,
        })),
        unattributedFuel: allocation.unattributed / POLICY.weightScale,
      });
      previous = { time: sample.time, fuel: sample[fuelKey] };
    }
    // Round once over the whole observed match. Rounding every one-point
    // interval would repeatedly award equal ties to the lowest team number.
    const finalAllocation = apportion(
      observedFuel - unattributedFuel,
      robots.map((r) => ({
        teamNumber: r.teamNumber,
        weight: r.estimatedFuelMicros,
      })),
    );
    for (const robot of robots) {
      robot.estimatedFuel = finalAllocation.teams.find(
        (t) => t.teamNumber === robot.teamNumber,
      )!.points;
      robot.estimatedPoints = robot.estimatedFuel * POLICY.fuelPoints;
    }
    const unattributedNonFuelPoints =
      scoreboardPoints - observedFuel * POLICY.fuelPoints;
    const unattributedPoints =
      unattributedFuel * POLICY.fuelPoints + unattributedNonFuelPoints;
    if (
      robots.reduce((sum, r) => sum + r.estimatedPoints, 0) +
        unattributedPoints !==
      scoreboardPoints
    )
      throw new Error("Point conservation failed");
    return {
      alliance: color,
      scoreboardPoints,
      observedFuel,
      teams: robots,
      unattributedFuel,
      unattributedNonFuelPoints,
      unattributedPoints,
      pointsConserved: true,
      intervals,
    };
  });
  const semanticInput = {
    matchKey: input.matchKey,
    slots,
    sourceTeams: allowed,
    reports: prepared
      .map((r) => ({
        team: r.report.teamNumber,
        source: r.report.sourceTeamNumber,
        windows: r.windows,
      }))
      .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    observations: used,
  };
  return {
    algorithm: VERSION,
    policy: { ...POLICY },
    matchKey: input.matchKey,
    sourceTeams: allowed,
    semanticInputSha256: createHash("sha256")
      .update(JSON.stringify(semanticInput))
      .digest("hex"),
    estimate: true,
    scoreboardThrough: endpoint.time,
    unobservedTailSeconds: 163 - endpoint.time,
    pointSamples: scores.length,
    fuelSamples: used.length,
    diagnostics,
    alliances,
    limitations: [
      "Team values are deterministic estimates, not directly observed individual scores.",
      "Scouting quantities provide relative attribution weights, never the point budget.",
      "Each source team has equal voting weight; identical scoring timelines within a source are deduplicated.",
      "Unexplained non-fuel points, including possible penalties or tower scores, remain unattributed.",
      "Sparse OCR intervals retain their observed delta but do not establish exact shot times.",
      "A reading at 0:00 is the last observed scoreboard value, not a guarantee that official post-match adjustments are final.",
    ],
  };
}
