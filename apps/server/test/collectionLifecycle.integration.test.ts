import { createHash, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
  warning: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/clearCache.js", () => ({
  invalidateCache: effects.invalidate,
}));
vi.mock("../src/handler/slack/sendWarningNotification.js", () => ({
  sendWarningToSlack: effects.warning,
}));
const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error("Use a disposable local lovat_test database");
}
process.env.DOTENV_CONFIG_PATH = "/dev/null";
const { db } = await import("@lovat/db");
const { preMatch } = await import("../src/handler/collection/preMatch.js");
const { startMatch } = await import("../src/handler/collection/startMatch.js");
const { endMatch } = await import("../src/handler/collection/endMatch.js");
const { submitReport } =
  await import("../src/handler/collection/submitReport.js");
const app = express();
app.use(express.json());
app.post("/load", preMatch);
app.post("/load/:match/:team", preMatch);
app.post("/start", startMatch);
app.post("/end", endMatch);
app.post("/submit", submitReport);
const id = randomUUID();
const sourceTeam = -Math.floor(Math.random() * 1_000_000_000) - 1;
const robot = 1_000_000_000 + Math.floor(Math.random() * 500_000_000);
const scout = randomUUID();
const otherScout = randomUUID();
const matchKey = `2026test-${id}_qm1`;
const tournamentKey = `2026test-${id}`;
const slotKey = `${matchKey}-${robot}`;
const sessionUuid = randomUUID();
const startTime = Date.now() - 180_000;
const endTime = startTime + 150_000;
function call(path: string, body: object, scoutUuid = scout) {
  return request(app)
    .post(path)
    .set("X-Team-Code", id)
    .set("X-Scouter-UUID", scoutUuid)
    .set("X-Device-Id", id)
    .send(body);
}
const report = (uuid: string) => ({
  uuid,
  scouterUuid: scout,
  tournamentKey,
  matchType: "QUALIFICATION",
  matchNumber: 1,
  teamNumber: robot,
  startTime,
  notes: "fixture",
  robotRoles: ["SCORING"],
  mobility: "NONE",
  beached: "NEITHER",
  feederTypes: [],
  intakeType: "NEITHER",
  robotBrokeDescription: null,
  driverAbility: 3,
  accuracy: null,
  disrupts: false,
  defenseEffectiveness: 0,
  scoresWhileMoving: false,
  autoClimb: "NOT_ATTEMPTED",
  endgameClimb: "NOT_ATTEMPTED",
  events: [
    [0, 2, 8],
    [10.125, 0, 2],
    [20.456, 1, 2, 3],
  ],
});
async function ended(uuid: string, attemptUuid?: string) {
  expect(
    (
      await call(`/load/${matchKey}/${robot}`, {
        uuid,
        ...(attemptUuid ? { trainingAttemptUuid: attemptUuid } : {}),
      })
    ).status,
  ).toBe(201);
  expect((await call("/start", { uuid, startTime })).status).toBe(200);
  expect((await call("/end", { uuid, endTime })).status).toBe(200);
}
beforeAll(async () => {
  for (const number of [sourceTeam, robot])
    await db.team.create({
      data: { number, name: "Synthetic lifecycle fixture" },
    });
  await db.registeredTeam.create({
    data: { number: sourceTeam, code: id, email: `${id}@example.invalid` },
  });
  for (const uuid of [scout, otherScout])
    await db.scouter.create({ data: { uuid, sourceTeamNumber: sourceTeam } });
  await db.tournament.create({
    data: { key: tournamentKey, name: "Lifecycle fixture" },
  });
  await db.match.create({
    data: {
      key: matchKey,
      tournamentKey,
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 1,
    },
  });
  await db.teamMatchData.create({
    data: {
      key: slotKey,
      matchKey,
      tournamentKey,
      matchType: "QUALIFICATION",
      matchNumber: 1,
      teamNumber: robot,
    },
  });
  const video = await db.trainingVideo.create({
    data: { matchKey, videoLink: "https://example.invalid/training" },
  });
  await db.trainingSession.create({
    data: {
      uuid: sessionUuid,
      sourceTeamNumber: sourceTeam,
      trainingVideoUuid: video.uuid,
      pairingTokenHash: createHash("sha256").update(id).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
});
afterAll(async () => {
  await db.trainingSession.deleteMany({
    where: { sourceTeamNumber: sourceTeam },
  });
  await db.scoutReportInProgress.deleteMany({
    where: { sourceTeamNumber: sourceTeam },
  });
  await db.tournament.deleteMany({ where: { key: tournamentKey } });
  await db.team.deleteMany({ where: { number: { in: [sourceTeam, robot] } } });
  await db.$disconnect();
});
describe("Collection match lifecycle transactions", () => {
  it("completes the flow with client UUIDs and idempotent retries", async () => {
    const uuid = randomUUID();
    expect((await call(`/load/${matchKey}/${robot}`, { uuid })).status).toBe(
      201,
    );
    expect((await call("/end", { uuid, endTime })).status).toBe(409);
    expect((await call("/start", { uuid, startTime })).status).toBe(200);
    expect(
      (await call("/start", { uuid, startTime: startTime + 1 })).status,
    ).toBe(409);
    expect((await call("/end", { uuid, endTime })).status).toBe(200);
    expect((await call("/submit", report(uuid), otherScout)).status).toBe(404);
    const submitted = await Promise.all([
      call("/submit", report(uuid)),
      call("/submit", report(uuid)),
    ]);
    expect(submitted.some((result) => result.status === 200)).toBe(true);
    expect(
      submitted.every((result) => [200, 409].includes(result.status)),
    ).toBe(true);
    expect(await db.scoutReport.count({ where: { uuid } })).toBe(1);
    expect(await db.event.count({ where: { scoutReportUuid: uuid } })).toBe(3);
    expect(
      (
        await db.event.findFirstOrThrow({
          where: { scoutReportUuid: uuid, action: "STOP_SCORING" },
        })
      ).time,
    ).toBe(20.456);
    const draft = await db.scoutReportInProgress.findUniqueOrThrow({
      where: { uuid },
    });
    expect(draft.status).toBe("SUBMITTED");
    expect(draft.revision).toBe(3);
    expect(draft.finalizedReportUuid).toBe(uuid);
    expect((await call("/start", { uuid, startTime })).status).toBe(200);
    expect((await call("/end", { uuid, endTime })).status).toBe(200);
    expect((await call("/submit", report(uuid))).status).toBe(200);
    expect(
      (await call("/submit", { ...report(uuid), notes: "changed" })).status,
    ).toBe(409);
  });
  it("rolls back the draft claim when completed-report creation fails", async () => {
    const uuid = randomUUID();
    await ended(uuid);
    await db.scoutReport.create({
      data: {
        uuid,
        scouterUuid: scout,
        teamMatchKey: slotKey,
        startTime: new Date(startTime),
        notes: "existing",
        robotRoles: [],
        driverAbility: 3,
        autoClimb: "NOT_ATTEMPTED",
        beached: "NEITHER",
        defenseEffectiveness: 0,
        feederTypes: [],
        intakeType: "NEITHER",
        fieldTraversal: "NONE",
        scoresWhileMoving: false,
        disrupts: false,
        endgameClimb: "NOT_ATTEMPTED",
      },
    });
    expect((await call("/submit", report(uuid))).status).toBe(409);
    const draft = await db.scoutReportInProgress.findUniqueOrThrow({
      where: { uuid },
    });
    expect(draft.status).toBe("ENDED");
    expect(draft.revision).toBe(2);
    expect(draft.submittedAt).toBeNull();
    expect(await db.event.count({ where: { scoutReportUuid: uuid } })).toBe(0);
  });
  it("links training reports and attempts without competition side effects", async () => {
    const attempt = await db.trainingAttempt.create({
      data: { sessionUuid, scouterUuid: scout },
    });
    const uuid = randomUUID();
    await ended(uuid, attempt.uuid);
    const invalidations = effects.invalidate.mock.calls.length;
    expect(
      (
        await call("/submit", {
          ...report(uuid),
          robotBrokeDescription: "practice break",
        })
      ).status,
    ).toBe(200);
    const saved = await db.scoutReport.findUniqueOrThrow({ where: { uuid } });
    expect(saved.training).toBe(true);
    expect(saved.trainingSessionUuid).toBe(sessionUuid);
    expect(
      (
        await db.trainingAttempt.findUniqueOrThrow({
          where: { uuid: attempt.uuid },
        })
      ).submittedAt,
    ).not.toBeNull();
    expect(effects.invalidate).toHaveBeenCalledTimes(invalidations);
    expect(effects.warning).not.toHaveBeenCalled();
  });
  it("rejects an expired training session rather than rerouting its report", async () => {
    const attempt = await db.trainingAttempt.create({
      data: { sessionUuid, scouterUuid: scout },
    });
    const uuid = randomUUID();
    await ended(uuid, attempt.uuid);
    await db.trainingSession.update({
      where: { uuid: sessionUuid },
      data: { expiresAt: new Date(0) },
    });
    expect((await call("/submit", report(uuid))).status).toBe(410);
    expect(await db.scoutReport.count({ where: { uuid } })).toBe(0);
    expect(
      (await db.scoutReportInProgress.findUniqueOrThrow({ where: { uuid } }))
        .status,
    ).toBe("ENDED");
  });
});

it("loads a manually selected match using Collection's ordinal identity", async () => {
  const uuid = randomUUID();
  const result = await call("/load", {
    uuid,
    teamNumber: robot,
    matchIdentity: {
      tournamentKey,
      matchType: "QUALIFICATION",
      matchNumber: 1,
    },
  });
  expect(result.status).toBe(201);
  expect(
    (await db.scoutReportInProgress.findUniqueOrThrow({ where: { uuid } }))
      .teamNumber,
  ).toBe(robot);
});
