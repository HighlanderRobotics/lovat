import { createHash } from "node:crypto";
import {
  apportion,
  compare,
  fusionInputSchema,
  LEGACY_POLICY as POLICY,
  prepareFusion,
  consensusWeight,
} from "./fusion-common";
import { fuseOfficialMatch, OFFICIAL_POLICY } from "./fusion-official";
export {
  apportion,
  fusionInputSchema,
  type FusionInput,
} from "./fusion-common";
const VERSION = "scoreboard-constrained-fusion-v1";
export function fuseMatch(raw: unknown, sourceTeams: number[]) {
  const input = fusionInputSchema.parse(raw);
  const state = prepareFusion(
    input,
    sourceTeams,
    input.tba === undefined ? POLICY : OFFICIAL_POLICY,
  );
  if (input.tba !== undefined) return fuseOfficialMatch(state);
  const { allowed, slots, diagnostics, prepared, samples } = state;
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
  const intervalWeights = (teamNumber: number, from: number, to: number) =>
    consensusWeight(prepared, POLICY.weightScale, teamNumber, from, to);
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
    slots: slots.map(({ teamNumber, alliance }) => ({ teamNumber, alliance })),
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
