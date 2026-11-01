import { afterEach, beforeEach, expect, it, vi } from "vitest";
import raw from "./fixtures/training/118-johnson-qual-19.report.json";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  scoutReport: { findUnique: vi.fn() },
  trainingScore: { create: vi.fn() },
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
import {
  compareTrainingReports,
  gradeTrainingReport,
  reportEvents,
  TRAINING_RUBRIC,
} from "../src/handler/training/gradeReport.js";

const answer = {
  ...raw,
  uuid: "answer",
  teamMatchKey: "robot-match",
  fieldTraversal: raw.mobility,
  events: reportEvents(raw.events),
};
const submission = () => ({
  ...answer,
  uuid: "submitted",
  training: true,
  trainingScores: [],
  trainingSession: {
    trainingVideo: { answerKeyReports: [answer], excludedFields: [] },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((callback) => callback(db));
  db.scoutReport.findUnique.mockResolvedValue(submission());
});
afterEach(() => vi.restoreAllMocks());

it.each([
  null,
  { ...submission(), training: false },
  { ...submission(), trainingScores: [{ rubricVersion: TRAINING_RUBRIC }] },
])(
  "does not grade missing, competition, or already graded reports (%j)",
  async (report) => {
    db.scoutReport.findUnique.mockResolvedValue(report);
    await gradeTrainingReport("submitted");
    expect(db.trainingScore.create).not.toHaveBeenCalled();
  },
);
it.each([
  null,
  { trainingVideo: null },
  {
    trainingVideo: { answerKeyReports: [{ ...answer, teamMatchKey: "other" }] },
  },
])(
  "fails without recording a score when the matching answer key is unavailable (%j)",
  async (trainingSession) => {
    db.scoutReport.findUnique.mockResolvedValue({
      ...submission(),
      trainingSession,
    });
    await expect(gradeTrainingReport("submitted")).rejects.toThrow(
      "No answer key",
    );
    expect(db.trainingScore.create).not.toHaveBeenCalled();
  },
);
it.each([[], { oldFormat: true }])(
  "stores an auditable grade with the current rubric (%j)",
  async (excludedFields) => {
    const report = submission();
    db.scoutReport.findUnique.mockResolvedValue({
      ...report,
      trainingScores: [{ rubricVersion: "training-v1" }],
      trainingSession: {
        trainingVideo: { answerKeyReports: [answer], excludedFields },
      },
    });
    await gradeTrainingReport("submitted");
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.scoutReport.findUnique.mock.invocationCallOrder[0],
    );
    const saved = db.trainingScore.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({
      reportUuid: "submitted",
      answerKeyReportUuid: "answer",
      rubricVersion: TRAINING_RUBRIC,
      overallScore: 100,
    });
    expect(saved.answerKeySnapshot.events).toEqual(answer.events);
    expect(saved.submittedReportSnapshot).not.toHaveProperty("trainingSession");
    expect(saved.submittedReportSnapshot).not.toHaveProperty("trainingScores");
  },
);
it("propagates failed grade writes so they can be retried", async () => {
  db.trainingScore.create.mockRejectedValue(new Error("database unavailable"));
  await expect(gradeTrainingReport("submitted")).rejects.toThrow(
    "database unavailable",
  );
});
it("handles empty timelines, extra fuel and null quantities explicitly", () => {
  const empty = { events: [] };
  expect(compareTrainingReports(empty, empty).overallScore).toBe(100);
  const event = {
    action: "STOP_SCORING",
    position: "NONE",
    time: 10,
    quantity: null,
  };
  for (const [actual, expected] of [
    [null, 2],
    [2, null],
  ] as const) {
    const result = compareTrainingReports(
      { events: [{ ...event, quantity: actual }] },
      { events: [{ ...event, quantity: expected }] },
    );
    expect(result.breakdown.quantities[0].differences[0]).toMatchObject({
      expected: expected ?? 0,
      actual,
    });
  }
  expect(
    compareTrainingReports({ events: [{ ...event, quantity: 3 }] }, empty)
      .breakdown.quantities[0].score,
  ).toBe(0);
  expect(
    compareTrainingReports(empty, empty, [
      "robotRoles",
      "mobility",
      "autoClimb",
      "endgameClimb",
      "intakeType",
      "beached",
      "scoresWhileMoving",
    ]).overallScore,
  ).toBe(80);
});
