import { Prisma, type EventAction, type Position } from "@lovat/db";
import db from "../../prismaClient.js";
import { EventActionMap, PositionMap } from "../manager/managerConstants.js";

export type GradingReport = {
  events: {
    time: number;
    action: string;
    position: string;
    quantity: number | null;
  }[];
  [field: string]: unknown;
};

const sum = (report: GradingReport, action: string) =>
  report.events
    .filter((e) => e.action === action)
    .reduce((n, e) => n + (e.quantity ?? 0), 0);

export const TRAINING_RUBRIC = "training-v3";
export const TIMING_TOLERANCE_SECONDS = 5;
const quantityAllowance = (expected: number, action: string) =>
  expected === 0 ? 0 : action === "STOP_SCORING" ? 30 : 10;
const quantityScore = (expected: number, actual: number, action: string) =>
  expected > 0 && actual === 0
    ? 0
    : Math.max(
        0,
        1 -
          Math.max(
            0,
            Math.abs(expected - actual) - quantityAllowance(expected, action),
          ) /
            Math.max(expected - quantityAllowance(expected, action), 1),
      );
type RunDifference = {
  time: number;
  expected: number;
  actual: number | null;
  allowance: number;
};
type TimelineDifference = {
  action: string;
  position: string;
  expectedTime: number | null;
  actualTime: number | null;
  deltaSeconds: number | null;
};

export type GradingResult = {
  overallScore: number;
  breakdown: {
    rubricVersion: string;
    quantities: {
      action: string;
      expected: number;
      actual: number;
      score: number;
      differences: RunDifference[];
      allowance: number;
    }[];
    timeline: {
      matched: number;
      expected: number;
      actual: number;
      toleranceSeconds: number;
      differences: TimelineDifference[];
      score: number;
    };
    fields: {
      field: string;
      expected: unknown;
      actual: unknown;
      correct: boolean;
    }[];
  };
};

export function compareTrainingReports(
  actual: GradingReport,
  expected: GradingReport,
  excluded: string[] = [],
): GradingResult {
  const quantities = ["STOP_SCORING", "STOP_FEEDING"].map((action) => {
    const target = sum(expected, action),
      observed = sum(actual, action);
    return {
      action,
      differences: [] as RunDifference[],
      expected: target,
      actual: observed,
      score: quantityScore(target, observed, action),
      allowance: quantityAllowance(target, action),
    };
  });
  // One-to-one matching penalizes both missed and extra events. Wall-clock report
  // start times do not participate; event times are relative match seconds.
  const remaining = new Set(actual.events.map((_, i) => i));
  let matched = 0;
  const pairs = new Map<
    (typeof expected.events)[number],
    (typeof actual.events)[number]
  >();
  for (const event of expected.events) {
    const index = [...remaining]
      .filter(
        (i) =>
          actual.events[i].action === event.action &&
          actual.events[i].position === event.position &&
          Math.abs(actual.events[i].time - event.time) <=
            TIMING_TOLERANCE_SECONDS,
      )
      .sort(
        (a, b) =>
          Math.abs(actual.events[a].time - event.time) -
          Math.abs(actual.events[b].time - event.time),
      )[0];
    if (index !== undefined) {
      pairs.set(event, actual.events[index]);
      remaining.delete(index);
      matched++;
    }
  }
  // Totals alone could hide swapped or inflated individual shooting runs.
  // Split quantity credit equally between the total and each matched run.
  for (const quantity of quantities) {
    const runs = expected.events.filter(
      (event) => event.action === quantity.action,
    );
    const runScore =
      runs.length === 0
        ? actual.events.some((event) => event.action === quantity.action)
          ? 0
          : 1
        : runs.reduce((total, event) => {
            const observed = pairs.get(event);
            return (
              total +
              (observed
                ? quantityScore(
                    event.quantity ?? 0,
                    observed.quantity ?? 0,
                    quantity.action,
                  )
                : 0)
            );
          }, 0) / runs.length;
    quantity.differences = runs
      .filter(
        (event) =>
          !pairs.has(event) || event.quantity !== pairs.get(event)?.quantity,
      )
      .map((event) => ({
        time: event.time,
        expected: event.quantity ?? 0,
        actual: pairs.get(event)?.quantity ?? null,
        allowance: quantityAllowance(event.quantity ?? 0, quantity.action),
      }));
    quantity.score = (quantity.score + runScore) / 2;
  }
  const timeline = {
    matched,
    expected: expected.events.length,
    actual: actual.events.length,
    toleranceSeconds: TIMING_TOLERANCE_SECONDS,
    differences: [
      ...expected.events
        .filter(
          (event) => !pairs.has(event) || pairs.get(event)!.time !== event.time,
        )
        .map((event) => ({
          action: event.action,
          position: event.position,
          expectedTime: event.time,
          actualTime: pairs.get(event)?.time ?? null,
          deltaSeconds: pairs.has(event)
            ? pairs.get(event)!.time - event.time
            : null,
        })),
      ...[...remaining].map((index) => ({
        action: actual.events[index].action,
        position: actual.events[index].position,
        expectedTime: null,
        actualTime: actual.events[index].time,
        deltaSeconds: null,
      })),
    ],
    score:
      expected.events.length + actual.events.length === 0
        ? 1
        : (2 * matched) / (expected.events.length + actual.events.length),
  };
  const fields = [
    "robotRoles",
    "mobility",
    "autoClimb",
    "endgameClimb",
    "intakeType",
    "beached",
    "scoresWhileMoving",
  ]
    .filter((field) => !excluded.includes(field))
    .map((field) => {
      const normalize = (value: unknown) =>
        Array.isArray(value) ? [...value].sort() : value;
      return {
        field,
        expected: expected[field],
        actual: actual[field],
        correct:
          JSON.stringify(normalize(expected[field])) ===
          JSON.stringify(normalize(actual[field])),
      };
    });
  const score =
    (50 * quantities.reduce((n, q) => n + q.score, 0)) / quantities.length +
    30 * timeline.score +
    (20 * fields.filter((f) => f.correct).length) / Math.max(fields.length, 1);
  return {
    overallScore: Math.round(score * 100) / 100,
    breakdown: { rubricVersion: TRAINING_RUBRIC, quantities, timeline, fields },
  };
}

export async function gradeTrainingReport(uuid: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT uuid FROM "ScoutReport" WHERE uuid = ${uuid} FOR UPDATE`,
    );
    const report = await tx.scoutReport.findUnique({
      where: { uuid },
      include: {
        events: true,
        trainingScores: true,
        trainingSession: {
          include: {
            trainingVideo: {
              include: { answerKeyReports: { include: { events: true } } },
            },
          },
        },
      },
    });
    if (
      !report?.training ||
      report.trainingScores.some((s) => s.rubricVersion === TRAINING_RUBRIC)
    ) {
      return;
    }
    const video = report.trainingSession?.trainingVideo;
    const answer = video?.answerKeyReports.find(
      (r) => r.teamMatchKey === report.teamMatchKey,
    );
    if (!answer || !video) {
      throw new Error("No answer key for this training robot.");
    }
    const result = compareTrainingReports(
      { ...report, mobility: report.fieldTraversal },
      { ...answer, mobility: answer.fieldTraversal },
      Array.isArray(video.excludedFields)
        ? (video.excludedFields as string[])
        : [],
    );
    await tx.trainingScore.create({
      data: {
        reportUuid: uuid,
        answerKeyReportUuid: answer.uuid,
        rubricVersion: TRAINING_RUBRIC,
        overallScore: result.overallScore,
        breakdown: JSON.parse(JSON.stringify(result.breakdown)),
        answerKeySnapshot: JSON.parse(JSON.stringify(answer)),
        submittedReportSnapshot: JSON.parse(
          JSON.stringify({
            ...report,
            trainingSession: undefined,
            trainingScores: undefined,
          }),
        ),
      },
    });
  });
}

export function reportEvents(events: number[][]): {
  time: number;
  action: EventAction;
  position: Position;
  quantity: number;
}[] {
  return events.map(([time, action, position, quantity]) => ({
    time,
    action: EventActionMap[action],
    position: PositionMap[position],
    quantity: quantity ?? 0,
  }));
}
