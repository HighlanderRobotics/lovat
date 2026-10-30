import { describe, it, expect, afterAll } from "vitest";
import fixture from "./fixtures/training/118-johnson-qual-19.report.json";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error("Use the disposable local lovat_test database.");
}
const { db } = await import("@lovat/db");
const { ensureBuiltInTrainingExercise, BUILT_IN_TRAINING_VIDEO } =
  await import("../src/handler/training/builtInExercise.js");
afterAll(async () => {
  await db.$disconnect();
});
describe("built-in Johnson training exercise", () => {
  it("creates the reviewed key on an empty catalog, then preserves existing identities and events on every restart", async () => {
    await ensureBuiltInTrainingExercise();
    const get = () =>
      db.trainingVideo.findUniqueOrThrow({
        where: { uuid: BUILT_IN_TRAINING_VIDEO },
        include: {
          answerKeyReports: {
            include: {
              events: { orderBy: { time: "asc" } },
              teamMatchData: true,
            },
          },
        },
      });
    const before = await get(),
      team = await db.registeredTeam.findUniqueOrThrow({
        where: { number: 8033 },
      });
    expect(before).toMatchObject({
      matchKey: "2026joh_qm19",
      startOffsetSeconds: 7,
      durationSeconds: 163,
      videoLink: "https://www.youtube.com/watch?v=gmdPS6_RVJw",
    });
    expect(before.answerKeyReports).toHaveLength(1);
    const key = before.answerKeyReports[0];
    expect(key.uuid).toBe(fixture.uuid);
    expect(key.training).toBe(true);
    expect(key.events).toHaveLength(37);
    expect(
      key.events
        .filter((e) => e.action === "STOP_SCORING")
        .reduce((n, e) => n + e.quantity, 0),
    ).toBe(207);
    expect(
      key.events
        .filter((e) => e.action === "STOP_FEEDING")
        .reduce((n, e) => n + e.quantity, 0),
    ).toBe(28);
    // Imported official slots may use a different key and station. Never replace it.
    const slot = key.teamMatchData;
    await db.teamMatchData.update({
      where: { key: slot.key },
      data: { station: 3 },
    });
    await Promise.all([
      ensureBuiltInTrainingExercise(),
      ensureBuiltInTrainingExercise(),
    ]);
    const after = await get();
    expect(after.answerKeyReports[0].teamMatchData.station).toBe(3);
    expect(after.answerKeyReports[0].teamMatchKey).toBe(slot.key);
    expect(after.answerKeyReports[0].events).toEqual(key.events);
    expect(
      await db.registeredTeam.findUniqueOrThrow({ where: { number: 8033 } }),
    ).toEqual(team);
    expect(
      await db.scoutReport.count({
        where: { uuid: fixture.uuid, training: false },
      }),
    ).toBe(0);
  });
  it("rejects conflicting reviewed video settings instead of silently replacing live session data", async () => {
    const video = await db.trainingVideo.findUniqueOrThrow({
      where: { uuid: BUILT_IN_TRAINING_VIDEO },
    });
    await db.trainingVideo.update({
      where: { uuid: video.uuid },
      data: { durationSeconds: 180 },
    });
    try {
      await expect(ensureBuiltInTrainingExercise()).rejects.toThrow(
        /conflicts/,
      );
    } finally {
      await db.trainingVideo.update({
        where: { uuid: video.uuid },
        data: { durationSeconds: video.durationSeconds },
      });
    }
  });
  it("rejects a damaged answer key rather than creating duplicate events", async () => {
    const event = await db.event.findFirstOrThrow({
      where: { scoutReportUuid: fixture.uuid, action: "STOP_SCORING" },
    });
    await db.event.update({
      where: { eventUuid: event.eventUuid },
      data: { quantity: event.quantity + 1 },
    });
    try {
      await expect(ensureBuiltInTrainingExercise()).rejects.toThrow(
        /conflicts/,
      );
    } finally {
      await db.event.update({
        where: { eventUuid: event.eventUuid },
        data: { quantity: event.quantity },
      });
    }
  });
  it("reattaches the built-in answer key when its catalog link is missing", async () => {
    await db.trainingVideo.update({
      where: { uuid: BUILT_IN_TRAINING_VIDEO },
      data: { answerKeyReports: { set: [] } },
    });
    await ensureBuiltInTrainingExercise();
    const video = await db.trainingVideo.findUniqueOrThrow({
      where: { uuid: BUILT_IN_TRAINING_VIDEO },
      include: { answerKeyReports: true },
    });
    expect(video.answerKeyReports.map((key) => key.uuid)).toEqual([
      fixture.uuid,
    ]);
  });
});
