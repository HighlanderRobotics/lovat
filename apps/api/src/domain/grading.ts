import type { PrismaClient } from "@lovat/db";
type Event = {
  time: number;
  action: string;
  position: string;
  quantity: number | null;
};
type Report = { events: readonly Event[]; [key: string]: unknown };
export const rubric = "training-v3";
const allowance = (n: number, action: string) =>
  n === 0 ? 0 : action === "STOP_SCORING" ? 30 : 10;
const credit = (expected: number, actual: number, action: string) =>
  expected > 0 && actual === 0
    ? 0
    : Math.max(
        0,
        1 -
          Math.max(
            0,
            Math.abs(expected - actual) - allowance(expected, action),
          ) /
            Math.max(expected - allowance(expected, action), 1),
      );
/** Match each expected event to one nearest unused observation within five seconds. */
export function grade(
  actual: Report,
  expected: Report,
  excluded: readonly string[] = [],
) {
  const available = new Set(actual.events.map((_, i) => i));
  const pairs = new Map<Event, Event>();
  for (const target of expected.events) {
    let nearest = -1,
      distance = Infinity;
    for (const i of available) {
      const observed = actual.events[i],
        delta = Math.abs(observed.time - target.time);
      if (
        observed.action === target.action &&
        observed.position === target.position &&
        delta <= 5 &&
        delta < distance
      ) {
        nearest = i;
        distance = delta;
      }
    }
    if (nearest >= 0) {
      pairs.set(target, actual.events[nearest]);
      available.delete(nearest);
    }
  }
  const quantities = ["STOP_SCORING", "STOP_FEEDING"].map((action) => {
    const targets = expected.events.filter((e) => e.action === action),
      observations = actual.events.filter((e) => e.action === action);
    const total = (events: readonly Event[]) =>
      events.reduce((n, e) => n + (e.quantity ?? 0), 0);
    const target = total(targets),
      observed = total(observations);
    const runScore = targets.length
      ? targets.reduce(
          (n, e) =>
            n +
            (pairs.has(e)
              ? credit(e.quantity ?? 0, pairs.get(e)!.quantity ?? 0, action)
              : 0),
          0,
        ) / targets.length
      : observations.length
        ? 0
        : 1;
    return {
      action,
      expected: target,
      actual: observed,
      score: (credit(target, observed, action) + runScore) / 2,
      allowance: allowance(target, action),
      differences: targets
        .filter((e) => !pairs.has(e) || e.quantity !== pairs.get(e)?.quantity)
        .map((e) => ({
          time: e.time,
          expected: e.quantity ?? 0,
          actual: pairs.get(e)?.quantity ?? null,
          allowance: allowance(e.quantity ?? 0, action),
        })),
    };
  });
  const timeline = {
    matched: pairs.size,
    expected: expected.events.length,
    actual: actual.events.length,
    toleranceSeconds: 5,
    score:
      expected.events.length + actual.events.length
        ? (2 * pairs.size) / (expected.events.length + actual.events.length)
        : 1,
    differences: [
      ...expected.events
        .filter((e) => !pairs.has(e) || pairs.get(e)?.time !== e.time)
        .map((e) => ({
          action: e.action,
          position: e.position,
          expectedTime: e.time,
          actualTime: pairs.get(e)?.time ?? null,
          deltaSeconds: pairs.has(e) ? pairs.get(e)!.time - e.time : null,
        })),
      ...[...available].map((i) => ({
        action: actual.events[i].action,
        position: actual.events[i].position,
        expectedTime: null,
        actualTime: actual.events[i].time,
        deltaSeconds: null,
      })),
    ],
  };
  const normalize = (value: unknown) =>
    JSON.stringify(Array.isArray(value) ? [...value].sort() : value);
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
    .map((field) => ({
      field,
      expected: expected[field],
      actual: actual[field],
      correct: normalize(expected[field]) === normalize(actual[field]),
    }));
  return {
    overallScore:
      Math.round(
        (25 * quantities.reduce((n, q) => n + q.score, 0) +
          30 * timeline.score +
          (20 * fields.filter((f) => f.correct).length) /
            Math.max(fields.length, 1)) *
          100,
      ) / 100,
    breakdown: { rubricVersion: rubric, quantities, timeline, fields },
  };
}
export async function gradeReport(db: PrismaClient, uuid: string) {
  await db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      'SELECT uuid FROM "ScoutReport" WHERE uuid = $1 FOR UPDATE',
      uuid,
    );
    const report = await tx.scoutReport.findUnique({
      where: { uuid },
      include: {
        events: true,
        trainingScores: { where: { rubricVersion: rubric } },
        trainingSession: {
          include: {
            trainingVideo: {
              include: { answerKeyReports: { include: { events: true } } },
            },
          },
        },
      },
    });
    if (!report?.training || report.trainingScores.length) return;
    const video = report.trainingSession?.trainingVideo,
      answer = video?.answerKeyReports.find(
        (r) => r.teamMatchKey === report.teamMatchKey,
      );
    if (!video || !answer) throw new Error("Training answer key unavailable");
    const result = grade(
      { ...report, mobility: report.fieldTraversal },
      { ...answer, mobility: answer.fieldTraversal },
      Array.isArray(video.excludedFields)
        ? video.excludedFields.filter((x): x is string => typeof x === "string")
        : [],
    );
    const json = (value: unknown) => JSON.parse(JSON.stringify(value));
    await tx.trainingScore.create({
      data: {
        reportUuid: uuid,
        answerKeyReportUuid: answer.uuid,
        rubricVersion: rubric,
        overallScore: result.overallScore,
        breakdown: json(result.breakdown),
        answerKeySnapshot: json(answer),
        submittedReportSnapshot: json({
          ...report,
          trainingSession: undefined,
          trainingScores: undefined,
        }),
      },
    });
  });
}
