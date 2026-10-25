import { isDeepStrictEqual } from "node:util";
import {
  chargedUpReportSchema,
  type ChargedUpReport,
} from "./chargedUpReport.js";
import type { GradingResult } from "./gradeReport.js";

export const CHARGED_UP_PASS_SCORE = 80;
export const chargedUpFields = [
  "driverAbility",
  "defenseEffectiveness",
  "activeDefensePercentage",
  "robotRoles",
  "intakeType",
  "intakePieces",
  "mobility",
  "endgameResult",
  "coopertition",
  "links",
] as const;

export function compareChargedUpReports(
  actual: ChargedUpReport,
  expected: ChargedUpReport,
  excluded: string[] = [],
): GradingResult {
  const remaining = new Set(actual.events.map((_, i) => i));
  const pairs = new Map<number, number>();
  for (const [index, event] of expected.events.entries()) {
    const match = [...remaining]
      .filter((i) => {
        const other = actual.events[i];
        return (
          other.action === event.action &&
          other.location === event.location &&
          other.scoringLocation === event.scoringLocation &&
          (event.position === undefined ||
            Math.abs((other.position ?? -100) - event.position) <= 5) &&
          Math.abs(other.time - event.time) <= 2
        );
      })
      .sort(
        (a, b) =>
          Math.abs(actual.events[a].time - event.time) -
          Math.abs(actual.events[b].time - event.time),
      )[0];
    if (match !== undefined) {
      pairs.set(index, match);
      remaining.delete(match);
    }
  }
  const quantities = ["SCORE_CONE", "SCORE_CUBE"].map((action) => {
    const target = expected.events.filter(
      (event) => event.action === action,
    ).length;
    const observed = actual.events.filter(
      (event) => event.action === action,
    ).length;
    return {
      action,
      expected: target,
      actual: observed,
      score: Math.max(0, 1 - Math.abs(target - observed) / Math.max(target, 1)),
      differences: expected.events.flatMap((event, index) =>
        event.action === action && !pairs.has(index)
          ? [{ time: event.time, expected: 1, actual: null }]
          : [],
      ),
    };
  });
  const fields = chargedUpFields
    .filter((field) => !excluded.includes(field))
    .map((field) => {
      const normalize = (value: unknown): unknown =>
        Array.isArray(value) ? [...value].sort() : value;
      return {
        field,
        expected: expected[field],
        actual: actual[field],
        correct: isDeepStrictEqual(
          normalize(expected[field]),
          normalize(actual[field]),
        ),
      };
    });
  const timeline = {
    matched: pairs.size,
    expected: expected.events.length,
    actual: actual.events.length,
    toleranceSeconds: 2,
    score:
      expected.events.length + actual.events.length === 0
        ? 1
        : (2 * pairs.size) / (expected.events.length + actual.events.length),
  };
  return {
    overallScore:
      Math.round(
        (25 * quantities.reduce((sum, q) => sum + q.score, 0) +
          30 * timeline.score +
          20 *
            (fields.length
              ? fields.filter((field) => field.correct).length / fields.length
              : 1)) *
          100,
      ) / 100,
    breakdown: { quantities, timeline, fields },
  };
}

export function chargedUpAnswer(value: unknown): ChargedUpReport | null {
  const parsed = chargedUpReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
