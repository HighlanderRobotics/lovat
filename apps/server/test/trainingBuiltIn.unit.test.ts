import { beforeEach, expect, it, vi } from "vitest";
import raw from "../src/handler/training/johnson118.report.json";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  team: { upsert: vi.fn() },
  registeredTeam: { upsert: vi.fn() },
  scouter: { upsert: vi.fn() },
  tournament: { upsert: vi.fn() },
  match: { upsert: vi.fn() },
  teamMatchData: { findFirst: vi.fn(), create: vi.fn() },
  scoutReport: { upsert: vi.fn() },
  trainingVideo: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
import {
  BUILT_IN_TRAINING_VIDEO,
  ensureBuiltInTrainingExercise,
} from "../src/handler/training/builtInExercise.js";

const canonicalVideo = () => ({
  uuid: BUILT_IN_TRAINING_VIDEO,
  matchKey: "2026joh_qm19",
  videoLink: "https://www.youtube.com/watch?v=gmdPS6_RVJw",
  startOffsetSeconds: 7,
  durationSeconds: 166,
  answerKeyReports: [{ uuid: raw.uuid }],
});
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((callback) => callback(db));
  db.scouter.upsert.mockResolvedValue({ sourceTeamNumber: 8033 });
  db.teamMatchData.findFirst.mockResolvedValue(null);
  db.teamMatchData.create.mockImplementation(({ data }) =>
    Promise.resolve(data),
  );
  db.scoutReport.upsert.mockImplementation(({ create }) =>
    Promise.resolve({ ...create, events: create.events.create }),
  );
  db.trainingVideo.findUnique.mockResolvedValue(null);
  db.trainingVideo.upsert.mockResolvedValue(canonicalVideo());
});

it("installs the reviewed exercise in one transaction with training-only answer data", async () => {
  await ensureBuiltInTrainingExercise();
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    db.team.upsert.mock.invocationCallOrder[0],
  );
  const report = db.scoutReport.upsert.mock.calls[0][0].create;
  expect(report).toMatchObject({
    uuid: raw.uuid,
    training: true,
    fieldTraversal: raw.mobility,
    teamMatchKey: "2026joh_qm19_118",
  });
  expect(
    report.events.create
      .filter((event: { action: string }) => event.action === "STOP_SCORING")
      .reduce(
        (sum: number, event: { quantity: number }) => sum + event.quantity,
        0,
      ),
  ).toBe(207);
  expect(db.trainingVideo.upsert.mock.calls[0][0]).toMatchObject({
    where: { uuid: BUILT_IN_TRAINING_VIDEO },
    update: { durationSeconds: 166 },
    create: { durationSeconds: 166, alliance: "RED" },
  });
});
it.each([163, 166])(
  "preserves existing identities while updating a reviewed %i-second video",
  async (durationSeconds) => {
    db.teamMatchData.findFirst.mockResolvedValue({
      key: "existing-slot",
      alliance: "RED",
    });
    db.trainingVideo.findUnique.mockResolvedValue({
      ...canonicalVideo(),
      durationSeconds,
    });
    await ensureBuiltInTrainingExercise();
    expect(db.teamMatchData.create).not.toHaveBeenCalled();
    expect(db.scoutReport.upsert.mock.calls[0][0].create.teamMatchKey).toBe(
      "existing-slot",
    );
    expect(db.scoutReport.upsert.mock.calls[0][0].update).toEqual({});
  },
);
it("refuses to repurpose a scout belonging to another team", async () => {
  db.scouter.upsert.mockResolvedValue({ sourceTeamNumber: 971 });
  await expect(ensureBuiltInTrainingExercise()).rejects.toThrow(
    "conflicting owner",
  );
  expect(db.scoutReport.upsert).not.toHaveBeenCalled();
});
it("refuses to overwrite an existing slot's alliance", async () => {
  db.teamMatchData.findFirst.mockResolvedValue({
    key: "slot",
    alliance: "BLUE",
  });
  await expect(ensureBuiltInTrainingExercise()).rejects.toThrow(
    "conflicting alliance",
  );
});
it.each(["training", "match", "events"])(
  "preserves an existing answer key with conflicting %s",
  async (field) => {
    db.scoutReport.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        ...create,
        training: field !== "training",
        teamMatchKey: field === "match" ? "another-match" : create.teamMatchKey,
        events: field === "events" ? [] : create.events.create,
      }),
    );
    await expect(ensureBuiltInTrainingExercise()).rejects.toThrow(
      "answer key conflicts",
    );
    expect(db.trainingVideo.upsert).not.toHaveBeenCalled();
  },
);
it("refuses to overwrite an unrecognized video duration", async () => {
  db.trainingVideo.findUnique.mockResolvedValue({ durationSeconds: 200 });
  await expect(ensureBuiltInTrainingExercise()).rejects.toThrow(
    "video conflicts",
  );
  expect(db.trainingVideo.upsert).not.toHaveBeenCalled();
});
it.each([
  { matchKey: "another-match" },
  { videoLink: "https://example.invalid/other" },
  { startOffsetSeconds: 0 },
  { durationSeconds: 200 },
  { answerKeyReports: [] },
  { answerKeyReports: [{ uuid: raw.uuid }, { uuid: "other" }] },
  { answerKeyReports: [{ uuid: "other" }] },
])(
  "rejects a stored video that differs from the reviewed exercise (%j)",
  async (fields) => {
    db.trainingVideo.upsert.mockResolvedValue({
      ...canonicalVideo(),
      ...fields,
    });
    await expect(ensureBuiltInTrainingExercise()).rejects.toThrow(
      "video conflicts",
    );
  },
);
