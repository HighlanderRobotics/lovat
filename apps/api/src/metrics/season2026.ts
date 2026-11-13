import { z } from "zod";
import type { MetricMetadata } from "@lovat/api";
import type { Facts } from "./facts.js";
import {
  defineDerivedMetric,
  defineMetric,
  mean,
  MetricRegistry,
  recencyWeightedMean,
} from "./registry.js";

function metadata(
  id: string,
  unit: string,
  requires: string[],
  aliases: string[] = [],
): MetricMetadata {
  return {
    id,
    label: id,
    unit,
    season: 2026,
    version: 1,
    aliases,
    kind: "number",
    precision: 2,
    missing: "exclude",
    dependencies: [],
    requires,
  };
}
function numberMetric(
  id: string,
  unit: string,
  requires: string[],
  calculate: (facts: Facts) => number | null,
  aliases: string[] = [],
) {
  return defineMetric({
    metadata: metadata(id, unit, requires, aliases),
    output: z.number(),
    calculate,
    reports: mean,
    aggregate: (values, level) =>
      level === "team" ? recencyWeightedMean(values) : mean(values),
  });
}
function rateMetric(
  id: string,
  action: string,
  start: string,
  aliases: string[] = [],
) {
  return defineMetric({
    metadata: metadata(id, "balls/second", ["events"], aliases),
    output: z.number(),
    calculate: (f: Facts) => ({
      quantity: f.quantity[action] ?? 0,
      seconds: f.durations[start] ?? 0,
    }),
    reports: (states) => {
      const seconds = states.reduce((sum, state) => sum + state.seconds, 0);
      return seconds > 0
        ? states.reduce((sum, state) => sum + state.quantity, 0) / seconds
        : null;
    },
    aggregate: (values, level) =>
      level === "team" ? recencyWeightedMean(values) : mean(values),
  });
}
const accuracyPercent = (value: number | null): number | null => {
  const percentages = [25, 55, 65, 75, 85, 95];
  return value !== null && Number.isInteger(value)
    ? (percentages[value] ?? null)
    : null;
};
const autoPoints = (f: Facts) =>
  f.autoPoints * ((accuracyPercent(f.report.accuracy) ?? 100) / 100) +
  (f.report.autoClimb === "SUCCEEDED" ? 15 : 0);
const teleopPoints = (f: Facts) =>
  f.teleopPoints * ((accuracyPercent(f.report.accuracy) ?? 100) / 100);
const endgamePoints: Record<string, number> = {
  NOT_ATTEMPTED: 0,
  FAILED: 0,
  L1: 10,
  L2: 20,
  L3: 30,
};
const eventCount = (id: string, action: string) =>
  numberMetric(id, "count", ["events"], (f) => f.counts[action] ?? 0);
const duration = (id: string, action: string) =>
  numberMetric(id, "seconds", ["events"], (f) => f.durations[action] ?? 0);
const fuelOutput = (f: Facts) =>
  (f.quantity.STOP_SCORING ?? 0) + (f.quantity.STOP_FEEDING ?? 0);

function distribution(
  id: string,
  options: readonly string[],
  calculate: (f: Facts) => readonly string[],
  requires: string[],
) {
  const aggregate = (
    values: readonly Record<string, number>[],
    level: "tournament" | "team",
  ) =>
    Object.fromEntries(
      options.map((option) => [
        option,
        (level === "team" ? recencyWeightedMean : mean)(
          values.map((value) => value[option] ?? 0),
        ) ?? 0,
      ]),
    );
  return defineMetric({
    metadata: { ...metadata(id, "proportion", requires), kind: "distribution" },
    output: z.record(z.string(), z.number()),
    calculate: (f: Facts) =>
      Object.fromEntries(
        options.map((option) => [
          option,
          calculate(f).includes(option) ? 1 : 0,
        ]),
      ),
    reports: (values) => aggregate(values, "tournament"),
    aggregate,
  });
}
export const season2026 = new MetricRegistry([
  numberMetric(
    "autoPoints",
    "points",
    ["events", "accuracy", "autoClimb"],
    autoPoints,
  ),
  numberMetric("teleopPoints", "points", ["events", "accuracy"], teleopPoints),
  numberMetric(
    "totalPoints",
    "points",
    ["events", "accuracy", "autoClimb", "endgameClimb"],
    (f) =>
      autoPoints(f) +
      teleopPoints(f) +
      (endgamePoints[f.report.endgameClimb] ?? 0),
  ),
  rateMetric("fuelPerSecond", "STOP_SCORING", "START_SCORING", ["scoringRate"]),
  rateMetric("feedingRate", "STOP_FEEDING", "START_FEEDING"),
  numberMetric("accuracy", "percent", ["accuracy"], (f) =>
    accuracyPercent(f.report.accuracy),
  ),
  numberMetric(
    "driverAbility",
    "rating",
    ["driverAbility"],
    (f) => f.report.driverAbility,
  ),
  numberMetric(
    "defenseEffectiveness",
    "rating",
    ["defenseEffectiveness"],
    (f) => f.report.defenseEffectiveness,
  ),
  eventCount("volleysPerMatch", "START_SCORING"),
  eventCount("feedsPerMatch", "STOP_FEEDING"),
  duration("contactDefenseTime", "START_DEFENDING"),
  duration("campingDefenseTime", "START_CAMPING"),
  duration("timeFeeding", "START_FEEDING"),
  defineDerivedMetric({
    metadata: {
      ...metadata("totalDefenseTime", "seconds", []),
      dependencies: ["contactDefenseTime", "campingDefenseTime"],
    },
    output: z.number(),
    calculate: (dependencies) => {
      const a = dependencies.get("contactDefenseTime");
      const b = dependencies.get("campingDefenseTime");
      return typeof a === "number" && typeof b === "number" ? a + b : null;
    },
    aggregate: (values, level) =>
      level === "team" ? recencyWeightedMean(values) : mean(values),
  }),
  numberMetric("totalFuelOutputted", "balls", ["events"], fuelOutput, [
    "totalFuelThroughput",
  ]),
  numberMetric("totalBallThroughput", "balls", ["events"], fuelOutput, [
    "totalBallThroughPut",
  ]),
  numberMetric(
    "totalBallsFed",
    "balls",
    ["events"],
    (f) => f.quantity.STOP_FEEDING ?? 0,
    ["totalFuelFed"],
  ),
  numberMetric("outpostIntakes", "count", ["events"], (f) => f.outpostIntakes),
  numberMetric(
    "autoClimbStartTime",
    "secondsRemaining",
    ["events", "autoClimb"],
    (f) =>
      f.report.autoClimb === "SUCCEEDED" && f.firstClimbAuto !== null
        ? 23 - f.firstClimbAuto
        : null,
  ),
  ...["L1", "L2", "L3"].map((level) =>
    numberMetric(
      level.toLowerCase() + "StartTime",
      "secondsRemaining",
      ["events", "endgameClimb"],
      (f) =>
        f.report.endgameClimb === level &&
        f.firstClimbTeleop !== null &&
        f.firstClimbTeleop <= 158
          ? 158 - f.firstClimbTeleop
          : null,
    ),
  ),
  distribution(
    "robotRole",
    ["CYCLING", "SCORING", "FEEDING", "DEFENDING", "IMMOBILE"],
    (f) => f.report.robotRoles,
    ["robotRoles"],
  ),
  distribution(
    "feederType",
    ["CONTINUOUS", "STOP_TO_SHOOT", "DUMP"],
    (f) => f.report.feederTypes,
    ["feederTypes"],
  ),
  distribution(
    "fieldTraversal",
    ["TRENCH", "BUMP", "BOTH", "NONE"],
    (f) => [f.report.fieldTraversal],
    ["fieldTraversal"],
  ),
  distribution(
    "climbResult",
    Object.keys(endgamePoints),
    (f) => [f.report.endgameClimb],
    ["endgameClimb"],
  ),
  distribution(
    "beached",
    ["ON_FUEL", "ON_BUMP", "BOTH", "NEITHER"],
    (f) => [f.report.beached],
    ["beached"],
  ),
  distribution(
    "scoresWhileMoving",
    ["TRUE", "FALSE"],
    (f) => [String(f.report.scoresWhileMoving).toUpperCase()],
    ["scoresWhileMoving"],
  ),
  distribution(
    "disrupts",
    ["TRUE", "FALSE"],
    (f) => [String(f.report.disrupts).toUpperCase()],
    ["disrupts"],
  ),
  distribution(
    "autoClimb",
    ["NOT_ATTEMPTED", "FAILED", "SUCCEEDED"],
    (f) => [f.report.autoClimb],
    ["autoClimb"],
  ),
  distribution(
    "intakeType",
    ["GROUND", "OUTPOST", "BOTH", "NEITHER"],
    (f) => [f.report.intakeType],
    ["intakeType"],
  ),
]);
