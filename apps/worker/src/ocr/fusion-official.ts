import { createHash } from "node:crypto";
import { z } from "zod";
import {
  apportion,
  consensusWeight,
  type Prepared,
  compare,
} from "./fusion-common";

export const OFFICIAL_POLICY = Object.freeze({
  minimumConfidence: 85,
  earlyMs: 2000,
  lateMs: 6000,
  reportLagMs: 2000,
  fmsLagMs: 3000,
  ocrLagMs: 1000,
  scoreboardLagMs: 4000,
  autoEnd: 20,
  teleopStart: 23,
  matchEnd: 163,
  settlingEnd: 167,
  tailAttributionMaxGapSeconds: 8,
  weightScale: 1000000,
  fuelPoints: 1,
});
const points = z.number().int().min(0).max(99999);
const hub = z.object({
  autoCount: points,
  autoPoints: points,
  teleopCount: points,
  teleopPoints: points,
  totalCount: points,
  totalPoints: points,
  endgameCount: points.optional(),
  endgamePoints: points.optional(),
});
const breakdown = z.object({
  hubScore: hub,
  autoTowerPoints: points,
  endGameTowerPoints: points,
  totalTowerPoints: points.optional(),
  totalAutoPoints: points,
  totalTeleopPoints: points,
  totalPoints: points,
  foulPoints: points,
  minorFoulCount: points.optional(),
  majorFoulCount: points.optional(),
  autoTowerRobot1: z.string().nullish(),
  autoTowerRobot2: z.string().nullish(),
  autoTowerRobot3: z.string().nullish(),
  endGameTowerRobot1: z.string().nullish(),
  endGameTowerRobot2: z.string().nullish(),
  endGameTowerRobot3: z.string().nullish(),
});
const officialSchema = z.object({
  key: z.string().regex(/^2026[a-z0-9]+_/),
  alliances: z.object({
    red: z.object({
      team_keys: z.array(z.string().regex(/^frc\d+[A-Za-z]?$/)).length(3),
      score: points,
    }),
    blue: z.object({
      team_keys: z.array(z.string().regex(/^frc\d+[A-Za-z]?$/)).length(3),
      score: points,
    }),
  }),
  score_breakdown: z.object({ red: breakdown, blue: breakdown }),
});
type Phase = "AUTO" | "TELEOP";
const level = (value: string | null | undefined) => {
  const text = value?.toLowerCase().replace(/[\s_-]/g, "");
  return text === "none"
    ? 0
    : text === "level1"
      ? 1
      : text === "level2"
        ? 2
        : text === "level3"
          ? 3
          : undefined;
};
function phaseTower(
  b: z.infer<typeof breakdown>,
  phase: Phase,
  mapping: number[],
) {
  const budget = phase === "AUTO" ? b.autoTowerPoints : b.endGameTowerPoints;
  const statuses = [1, 2, 3].map((index) =>
    phase === "AUTO"
      ? [b.autoTowerRobot1, b.autoTowerRobot2, b.autoTowerRobot3][index - 1]
      : [b.endGameTowerRobot1, b.endGameTowerRobot2, b.endGameTowerRobot3][
          index - 1
        ],
  );
  const nominal = statuses.map((value) => {
    const l = level(value);
    if (l === undefined) return undefined;
    if (l === 0) return 0;
    if (phase === "AUTO") return l === 1 ? 15 : undefined;
    return [0, 10, 20, 30][l];
  });
  const sum = nominal.reduce<number>((n, p) => n + (p ?? 0), 0),
    complete = nominal.every((p) => p !== undefined);
  // Do not silently scale standard rule values to fit inconsistent/custom data.
  const consistent = sum <= budget && (!complete || sum === budget);
  const teams = mapping
    .map((teamNumber, index) => ({
      teamNumber,
      status: statuses[index] ?? null,
      points: consistent ? (nominal[index] ?? 0) : 0,
    }))
    .sort((a, b) => a.teamNumber - b.teamNumber);
  return {
    budget,
    teams,
    unattributed: budget - teams.reduce((n, t) => n + t.points, 0),
    status: consistent
      ? complete
        ? "TBA_ROBOT_STATUSES"
        : "PARTIAL_TBA_STATUSES"
      : "STATUS_BUDGET_MISMATCH",
  };
}
export function fuseOfficialMatch(state: Prepared) {
  const { input, allowed, slots, prepared, samples, diagnostics } = state;
  const official = officialSchema.parse(input.tba);
  if (official.key !== input.matchKey)
    throw new Error("TBA match identity mismatch");
  if (
    new Set([
      ...official.alliances.red.team_keys,
      ...official.alliances.blue.team_keys,
    ]).size !== 6
  )
    throw new Error("Duplicate TBA robot identity");
  const endpoint = samples.at(-1)!;
  const scoreSamples = samples.filter(
    (s) =>
      s.redPoints !== undefined &&
      s.bluePoints !== undefined &&
      (s.pointsConfidence ?? 0) >= 85,
  );
  const lastPoints = scoreSamples.at(-1);
  const alliances = (["RED", "BLUE"] as const).map((color) => {
    const name = color === "RED" ? "red" : "blue",
      b = official.score_breakdown[name],
      roster = official.alliances[name],
      h = b.hubScore;
    if (
      h.autoCount + h.teleopCount !== h.totalCount ||
      h.autoPoints + h.teleopPoints !== h.totalPoints
    )
      throw new Error("TBA fuel phase totals are inconsistent");
    if (
      (h.endgameCount ?? 0) > h.teleopCount ||
      (h.endgamePoints ?? 0) > h.teleopPoints
    )
      throw new Error("TBA endgame fuel must be a subset of teleop");
    if (
      b.totalTowerPoints !== undefined &&
      b.autoTowerPoints + b.endGameTowerPoints !== b.totalTowerPoints
    )
      throw new Error("TBA tower totals are inconsistent");
    const otherAuto = b.totalAutoPoints - h.autoPoints - b.autoTowerPoints,
      otherTeleop = b.totalTeleopPoints - h.teleopPoints - b.endGameTowerPoints;
    const otherUnphased =
      b.totalPoints - b.totalAutoPoints - b.totalTeleopPoints - b.foulPoints;
    if (
      otherAuto < 0 ||
      otherTeleop < 0 ||
      otherUnphased < 0 ||
      roster.score !== b.totalPoints
    )
      throw new Error("TBA score components do not reconcile");
    const allianceSlots = slots.filter((s) => s.alliance === color);
    const mapping = roster.team_keys.map((key, index) => {
      const candidates = allianceSlots.filter(
        (s) => `frc${s.teamNumber}` === key || s.externalParticipantKey === key,
      );
      if (candidates.length !== 1)
        throw new Error(
          "TBA roster identity requires an explicit participant mapping",
        );
      const slot = candidates[0]!;
      if (slot.station !== undefined && slot.station !== index + 1)
        throw new Error("TBA station order does not match roster");
      return slot.teamNumber;
    });
    const autoTower = phaseTower(b, "AUTO", mapping),
      endgameTower = phaseTower(b, "TELEOP", mapping);
    if (endpoint[name] > h.totalCount)
      throw new Error(
        "OCR fuel exceeds the official TBA total; review the discrepancy",
      );
    const robots = allianceSlots.map((s) => ({
      teamNumber: s.teamNumber,
      estimatedFuelMicros: 0,
      estimatedFuel: 0,
      estimatedPoints: 0,
      autoFuelCount: 0,
      autoFuelPoints: 0,
      autoTowerPoints: autoTower.teams.find(
        (t) => t.teamNumber === s.teamNumber,
      )!.points,
      autoTowerStatus: autoTower.teams.find(
        (t) => t.teamNumber === s.teamNumber,
      )!.status,
      autoPoints: 0,
      teleopFuelCount: 0,
      teleopFuelPoints: 0,
      endgameTowerPoints: endgameTower.teams.find(
        (t) => t.teamNumber === s.teamNumber,
      )!.points,
      endgameTowerStatus: endgameTower.teams.find(
        (t) => t.teamNumber === s.teamNumber,
      )!.status,
      teleopPoints: 0,
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
    const phases = (["AUTO", "TELEOP"] as const).map((phase) => ({
      phase,
      fuelCount: phase === "AUTO" ? h.autoCount : h.teleopCount,
      fuelPoints: phase === "AUTO" ? h.autoPoints : h.teleopPoints,
      weights: robots.map((r) => ({ teamNumber: r.teamNumber, weight: 0 })),
      unattributedMicros: 0,
    }));
    type Allocation = ReturnType<typeof apportion>;
    const intervals: {
      from: number;
      to: number;
      observedFuelDelta: number;
      coverage: string;
      source: "OCR" | "TBA_REMAINDER";
      supportingTeams: number[];
      allocation: { teamNumber: number; fuelMicros: number }[];
      unattributedFuel: number;
      phases: {
        phase: Phase;
        fuelDelta: number;
        allocation: { teamNumber: number; fuelMicros: number }[];
        unattributedFuel: number;
      }[];
    }[] = [];
    const add = (
      from: number,
      to: number,
      autoDelta: number,
      teleDelta: number,
      source: "OCR" | "TBA_REMAINDER",
      allowAttribution = true,
    ) => {
      const components: (typeof intervals)[number]["phases"] = [];
      for (const [index, delta] of [autoDelta, teleDelta].entries()) {
        const phase = phases[index]!;
        const bounds = {
          from: phase.phase === "AUTO" ? 0 : OFFICIAL_POLICY.teleopStart * 1000,
          to:
            (phase.phase === "AUTO"
              ? OFFICIAL_POLICY.autoEnd
              : OFFICIAL_POLICY.matchEnd) * 1000,
          scoreboardLagMs: OFFICIAL_POLICY.scoreboardLagMs,
        };
        const weights = robots.map((r) => ({
          teamNumber: r.teamNumber,
          weight: allowAttribution
            ? consensusWeight(
                prepared,
                OFFICIAL_POLICY.weightScale,
                r.teamNumber,
                Math.round(from * 1000),
                Math.round(to * 1000),
                bounds,
              )
            : 0,
        }));
        const allocation: Allocation = apportion(
          delta * OFFICIAL_POLICY.weightScale,
          weights,
        );
        for (const share of allocation.teams)
          phase.weights.find(
            (w) => w.teamNumber === share.teamNumber,
          )!.weight += share.points;
        phase.unattributedMicros += allocation.unattributed;
        components.push({
          phase: phase.phase,
          fuelDelta: delta,
          allocation: allocation.teams.map((t) => ({
            teamNumber: t.teamNumber,
            fuelMicros: t.points,
          })),
          unattributedFuel:
            allocation.unattributed / OFFICIAL_POLICY.weightScale,
        });
      }
      const allocation = robots.map((r) => ({
        teamNumber: r.teamNumber,
        fuelMicros: components.reduce(
          (sum, c) =>
            sum +
            c.allocation.find((x) => x.teamNumber === r.teamNumber)!.fuelMicros,
          0,
        ),
      }));
      intervals.push({
        from,
        to,
        observedFuelDelta: autoDelta + teleDelta,
        coverage:
          source === "TBA_REMAINDER"
            ? "inferred-settling-window"
            : to - from > 3
              ? "sparse"
              : "dense",
        source,
        supportingTeams: allocation
          .filter((a) => a.fuelMicros > 0)
          .map((a) => a.teamNumber),
        allocation,
        unattributedFuel: components.reduce(
          (sum, c) => sum + c.unattributedFuel,
          0,
        ),
        phases: components,
      });
    };
    let previous = { time: 0, count: 0 };
    for (const sample of samples) {
      const current = sample[name];
      const autoDelta =
        Math.min(current, h.autoCount) - Math.min(previous.count, h.autoCount);
      const totalDelta = current - previous.count;
      add(previous.time, sample.time, autoDelta, totalDelta - autoDelta, "OCR");
      previous = { time: sample.time, count: current };
    }
    const missingAuto = h.autoCount - Math.min(endpoint[name], h.autoCount);
    const missingTele =
      h.teleopCount - Math.max(0, endpoint[name] - h.autoCount);
    if (missingAuto > 0) {
      phases[0]!.unattributedMicros +=
        missingAuto * OFFICIAL_POLICY.weightScale;
    }
    if (missingTele > 0)
      add(
        endpoint.time,
        OFFICIAL_POLICY.settlingEnd,
        0,
        missingTele,
        "TBA_REMAINDER",
        OFFICIAL_POLICY.matchEnd - endpoint.time <=
          OFFICIAL_POLICY.tailAttributionMaxGapSeconds,
      );
    const phaseResults = phases.map((p) => {
      const weights = [
        ...p.weights,
        { teamNumber: 0, weight: p.unattributedMicros },
      ];
      const fuel = apportion(p.fuelCount, weights),
        points = apportion(p.fuelPoints, weights);
      const unknownFuel = fuel.teams.find((t) => t.teamNumber === 0)!.points,
        unknownPoints = points.teams.find((t) => t.teamNumber === 0)!.points;
      for (const robot of robots) {
        const count = fuel.teams.find(
            (t) => t.teamNumber === robot.teamNumber,
          )!.points,
          pts = points.teams.find(
            (t) => t.teamNumber === robot.teamNumber,
          )!.points;
        robot.estimatedFuelMicros += p.weights.find(
          (t) => t.teamNumber === robot.teamNumber,
        )!.weight;
        if (p.phase === "AUTO") {
          robot.autoFuelCount = count;
          robot.autoFuelPoints = pts;
        } else {
          robot.teleopFuelCount = count;
          robot.teleopFuelPoints = pts;
        }
      }
      const tower = p.phase === "AUTO" ? autoTower : endgameTower,
        other = p.phase === "AUTO" ? otherAuto : otherTeleop;
      return {
        phase: p.phase,
        fuelCount: p.fuelCount,
        fuelPoints: p.fuelPoints,
        towerPoints: tower.budget,
        otherPoints: other,
        officialPoints:
          p.phase === "AUTO" ? b.totalAutoPoints : b.totalTeleopPoints,
        unattributedFuel: unknownFuel,
        unattributedFuelPoints: unknownPoints,
        unattributedTowerPoints: tower.unattributed,
        unattributedOtherPoints: other,
        unattributedPoints: unknownPoints + tower.unattributed + other,
        towerAttribution: tower.status,
      };
    });
    for (const r of robots) {
      r.estimatedFuel = r.autoFuelCount + r.teleopFuelCount;
      r.autoPoints = r.autoFuelPoints + r.autoTowerPoints;
      r.teleopPoints = r.teleopFuelPoints + r.endgameTowerPoints;
      r.estimatedPoints = r.autoPoints + r.teleopPoints;
    }
    const unattributedAutoPoints = phaseResults[0]!.unattributedPoints,
      unattributedTeleopPoints = phaseResults[1]!.unattributedPoints;
    const unattributedPoints =
      unattributedAutoPoints + unattributedTeleopPoints + otherUnphased;
    if (
      robots.reduce((n, r) => n + r.autoPoints, 0) + unattributedAutoPoints !==
        b.totalAutoPoints ||
      robots.reduce((n, r) => n + r.teleopPoints, 0) +
        unattributedTeleopPoints !==
        b.totalTeleopPoints ||
      robots.reduce((n, r) => n + r.estimatedPoints, 0) +
        unattributedPoints +
        b.foulPoints !==
        b.totalPoints
    )
      throw new Error("Official phase/total point conservation failed");
    return {
      alliance: color,
      scoreboardPoints: b.totalPoints,
      officialPoints: b.totalPoints,
      observedScoreboardPoints:
        lastPoints?.[color === "RED" ? "redPoints" : "bluePoints"] ?? null,
      observedFuel: endpoint[name],
      officialFuel: h.totalCount,
      unseenOfficialFuel: missingAuto + missingTele,
      unseenAutoFuel: missingAuto,
      unseenTeleopFuel: missingTele,
      teams: robots,
      phases: phaseResults,
      unattributedFuel: phaseResults.reduce(
        (n, p) => n + p.unattributedFuel,
        0,
      ),
      unattributedNonFuelPoints:
        autoTower.unattributed +
        endgameTower.unattributed +
        otherAuto +
        otherTeleop +
        otherUnphased,
      unattributedPoints,
      unattributedAutoPoints,
      unattributedTeleopPoints,
      otherUnphasedPoints: otherUnphased,
      foulPoints: b.foulPoints,
      foulsCommitted: {
        minor: b.minorFoulCount ?? null,
        major: b.majorFoulCount ?? null,
      },
      endgameFuelIncludedInTeleop: {
        count: h.endgameCount ?? null,
        points: h.endgamePoints ?? null,
      },
      pointsConserved: true,
      intervals,
    };
  });
  const normalized = {
    matchKey: input.matchKey,
    slots,
    sourceTeams: allowed,
    tba: official,
    reports: prepared
      .map((r) => ({
        team: r.report.teamNumber,
        source: r.report.sourceTeamNumber,
        windows: r.windows,
      }))
      .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    observations: samples,
  };
  return {
    algorithm: "scoreboard-constrained-fusion-v2-tba",
    policy: { ...OFFICIAL_POLICY },
    matchKey: input.matchKey,
    sourceTeams: allowed,
    semanticInputSha256: createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex"),
    estimate: true,
    officialSource: `https://www.thebluealliance.com/match/${input.matchKey}`,
    scoreboardThrough: lastPoints?.time ?? endpoint.time,
    fuelOCRThrough: endpoint.time,
    officialResultAvailable: true,
    estimateThrough: OFFICIAL_POLICY.settlingEnd,
    unobservedTailSeconds: 163 - (lastPoints?.time ?? endpoint.time),
    pointSamples: scoreSamples.length,
    fuelSamples: samples.length,
    diagnostics,
    alliances,
    limitations: [
      "Robot fuel shares remain estimates; TBA fixes alliance phase budgets, not individual fuel counts.",
      "Foul points are opponent-awarded alliance credit, never points assigned to an own-alliance robot.",
      "Tower points use TBA robot status in station order; inconsistent or missing awards remain unattributed.",
      "Phase membership follows official cumulative auto counts; scout eligibility allows two seconds of timing error and three seconds of FMS delay plus one second of OCR/display delay.",
      "TBA-only tail increments use a bounded inferred settling window, not fabricated OCR readings.",
      "TBA endgame fuel is already included in teleop fuel and is never added a second time.",
    ],
  };
}
