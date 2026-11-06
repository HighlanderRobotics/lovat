import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";
import johnsonFixture from "./fixtures/training/118-johnson-qual-19.json";
import johnsonReport from "./fixtures/training/118-johnson-qual-19.report.json";

const db = vi.hoisted(() => ({
  registeredTeam: { findUnique: vi.fn() },
  scouter: { findFirst: vi.fn() },
  scoutReportInProgress: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  teamMatchData: { findFirst: vi.fn() },
  scoutReport: { create: vi.fn() },
  trainingAttempt: { update: vi.fn() },
  $transaction: vi.fn(),
}));
const effects = vi.hoisted(() => ({ invalidate: vi.fn(), warning: vi.fn() }));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/lib/clearCache.js", () => ({
  invalidateCache: effects.invalidate,
}));
vi.mock("../src/handler/slack/sendWarningNotification.js", () => ({
  sendWarningToSlack: effects.warning,
}));
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/lovat_test";
const { startMatch } = await import("../src/handler/collection/startMatch.js");
const { endMatch } = await import("../src/handler/collection/endMatch.js");
const { submitReport } =
  await import("../src/handler/collection/submitReport.js");
const { Prisma } = await import("@lovat/db");
const uuid = "eb2f5a42-258a-4da4-83b1-319b694a8984";
const scout = "aa9a7c09-9d69-4ff1-a4ba-f97763c09e22";
const headers = { "x-team-code": "code", "x-scouter-uuid": scout };
const startTime = Date.UTC(2026, 0, 1);
const endTime = startTime + 150_000;
const report = {
  uuid,
  scouterUuid: scout,
  tournamentKey: "2026test",
  matchType: "QUALIFICATION",
  matchNumber: 1,
  teamNumber: 254,
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
    [10, 0, 2],
    [20, 1, 2, 3],
  ],
};
const draft = () => ({
  ...report,
  sourceTeamNumber: 8033,
  status: "ENDED",
  mode: "COMPETITION",
  schemaVersion: 1,
  startedAt: new Date(startTime),
  endedAt: new Date(endTime),
  expiresAt: new Date(Date.now() + 60_000),
  trainingSessionUuid: null,
  trainingAttemptUuid: null,
  trainingSession: null,
  payload: {},
});
const request = (body: unknown) => ({ body, headers });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
  db.scouter.findFirst.mockResolvedValue({ uuid: scout });
  db.scoutReportInProgress.findFirst.mockResolvedValue(draft());
  db.scoutReportInProgress.updateMany.mockResolvedValue({ count: 1 });
  db.teamMatchData.findFirst.mockResolvedValue({
    key: "match-team",
    matchNumber: 1,
    teamNumber: 254,
    tournamentKey: "2026test",
  });
  db.scoutReport.create.mockResolvedValue({ uuid });
  db.$transaction.mockImplementation((callback) => callback(db));
  effects.invalidate.mockResolvedValue(undefined);
  effects.warning.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("start and end Collection reports", () => {
  it("starts the loaded client UUID with its client timestamp", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      status: "LOADED",
      startedAt: null,
      endedAt: null,
    });
    const result = await invoke(startMatch, request({ uuid, startTime }));
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ uuid });
    expect(db.scoutReportInProgress.updateMany.mock.calls[0][0]).toMatchObject({
      where: { uuid, status: "LOADED" },
      data: { status: "STARTED", startedAt: new Date(startTime) },
    });
  });
  it("ends a started report", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      status: "STARTED",
      endedAt: null,
    });
    expect(
      (await invoke(endMatch, request({ uuid, endTime }))).statusCode,
    ).toBe(200);
    expect(db.scoutReportInProgress.updateMany.mock.calls[0][0]).toMatchObject({
      where: { uuid, status: "STARTED" },
      data: { status: "ENDED", endedAt: new Date(endTime) },
    });
  });
  it.each([null, { uuid }, { uuid, startTime: -1 }, { uuid, startTime: 9e20 }])(
    "rejects malformed starts",
    async (body) => {
      expect((await invoke(startMatch, request(body))).statusCode).toBe(400);
      expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
    },
  );
  it("rejects an end before the start", async () => {
    expect(
      (await invoke(endMatch, request({ uuid, endTime: startTime - 1 })))
        .statusCode,
    ).toBe(409);
    expect(db.scoutReportInProgress.updateMany).not.toHaveBeenCalled();
  });
  it("requires a start before ending", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      status: "LOADED",
      startedAt: null,
      endedAt: null,
    });
    expect(
      (await invoke(endMatch, request({ uuid, endTime }))).statusCode,
    ).toBe(409);
  });
  it("accepts exact start/end retries after later transitions", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      status: "SUBMITTED",
      expiresAt: new Date(0),
    });
    expect(
      (await invoke(startMatch, request({ uuid, startTime }))).statusCode,
    ).toBe(200);
    expect(
      (await invoke(endMatch, request({ uuid, endTime }))).statusCode,
    ).toBe(200);
    expect(db.scoutReportInProgress.updateMany).not.toHaveBeenCalled();
  });
  it("rejects changed start/end timestamps", async () => {
    expect(
      (await invoke(startMatch, request({ uuid, startTime: startTime + 1 })))
        .statusCode,
    ).toBe(409);
    expect(
      (await invoke(endMatch, request({ uuid, endTime: endTime + 1 })))
        .statusCode,
    ).toBe(409);
  });
  it("returns a retryable conflict when another request changes the state", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      status: "STARTED",
      endedAt: null,
    });
    db.scoutReportInProgress.updateMany.mockResolvedValue({ count: 0 });
    expect(
      (await invoke(endMatch, request({ uuid, endTime }))).statusCode,
    ).toBe(409);
  });
});

describe("Collection lifecycle ownership", () => {
  it("requires the team code and scout UUID", async () => {
    expect(
      (await invoke(submitReport, { body: report, headers: {} })).statusCode,
    ).toBe(400);
  });
  it("rejects invalid credentials", async () => {
    db.registeredTeam.findUnique.mockResolvedValue(null);
    expect((await invoke(submitReport, request(report))).statusCode).toBe(401);
  });
  it("rejects scouts outside the team and scopes the report query", async () => {
    db.scouter.findFirst.mockResolvedValue(null);
    expect((await invoke(submitReport, request(report))).statusCode).toBe(404);
    expect(db.scoutReportInProgress.findFirst).not.toHaveBeenCalled();
  });
  it("hides unavailable or foreign drafts", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue(null);
    expect((await invoke(submitReport, request(report))).statusCode).toBe(404);
    expect(db.scoutReportInProgress.findFirst.mock.calls[0][0].where).toEqual({
      uuid,
      sourceTeamNumber: 8033,
      scouterUuid: scout,
    });
  });
  it.each([
    { status: "ABANDONED" },
    { expiresAt: new Date(0) },
    { mode: "TRAINING", trainingSession: { expiresAt: new Date(0) } },
  ])("rejects expired drafts and training sessions", async (fields) => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      ...fields,
    });
    expect((await invoke(submitReport, request(report))).statusCode).toBe(410);
    expect(db.scoutReport.create).not.toHaveBeenCalled();
  });
});

describe("Collection submission", () => {
  it("submits the 118 Johnson answer-key fixture as training without changing fuel counts", async () => {
    const submission = {
      ...johnsonReport,
      uuid,
      scouterUuid: scout,
      startTime,
    };
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      tournamentKey: submission.tournamentKey,
      matchNumber: submission.matchNumber,
      teamNumber: submission.teamNumber,
      endedAt: new Date(
        startTime + johnsonFixture.timing.endTimeSeconds * 1000,
      ),
      mode: "TRAINING",
      trainingSessionUuid: "session",
      trainingAttemptUuid: "attempt",
      trainingSession: { expiresAt: new Date(Date.now() + 60_000) },
    });
    db.teamMatchData.findFirst.mockResolvedValue({
      key: "2026joh_qm19_118",
      tournamentKey: submission.tournamentKey,
      matchNumber: 19,
      teamNumber: 118,
    });

    const result = await invoke(submitReport, request(submission));

    expect(result.statusCode).toBe(200);
    const saved = db.scoutReport.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({
      training: true,
      trainingSessionUuid: "session",
      teamMatchKey: "2026joh_qm19_118",
      accuracy: 4,
      driverAbility: 5,
      endgameClimb: "NOT_ATTEMPTED",
    });
    const events = saved.events.create;
    const scoring = events.filter(
      (event: { action: string }) => event.action === "STOP_SCORING",
    );
    const feeding = events.filter(
      (event: { action: string }) => event.action === "STOP_FEEDING",
    );
    expect(
      scoring.reduce(
        (sum: number, event: { quantity: number }) => sum + event.quantity,
        0,
      ),
    ).toBe(207);
    expect(
      feeding.reduce(
        (sum: number, event: { quantity: number }) => sum + event.quantity,
        0,
      ),
    ).toBe(28);
    expect(scoring.at(-1)).toMatchObject({ time: 163, quantity: 1 });
    expect(effects.invalidate).not.toHaveBeenCalled();
    expect(effects.warning).not.toHaveBeenCalled();
  });

  it("saves the report, events, and draft link in a single transaction", async () => {
    const result = await invoke(submitReport, request(report));
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ uuid });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const data = db.scoutReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      uuid,
      scouterUuid: scout,
      teamMatchKey: "match-team",
      training: false,
      trainingSessionUuid: null,
      events: {
        create: [
          { time: 0, action: "START_MATCH" },
          { time: 10, action: "START_SCORING" },
          { time: 20, action: "STOP_SCORING", points: 3, quantity: 3 },
        ],
      },
    });
    expect(db.scoutReportInProgress.update).toHaveBeenCalledWith({
      where: { uuid },
      data: { finalizedReportUuid: uuid },
    });
  });
  it("preserves Collection's fractional event timestamps", async () => {
    const events = [
      [0, 2, 8],
      [10.125, 0, 2],
      [20.456, 1, 2, 3],
    ];
    expect(
      (await invoke(submitReport, request({ ...report, events }))).statusCode,
    ).toBe(200);
    expect(
      db.scoutReport.create.mock.calls[0][0].data.events.create[2].time,
    ).toBe(20.456);
  });
  it("stores training reports with their session and attempt", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      mode: "TRAINING",
      trainingSessionUuid: "session",
      trainingAttemptUuid: "attempt",
      trainingSession: { expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(
      (
        await invoke(
          submitReport,
          request({ ...report, robotBrokeDescription: "broke" }),
        )
      ).statusCode,
    ).toBe(200);
    expect(db.scoutReport.create.mock.calls[0][0].data).toMatchObject({
      training: true,
      trainingSessionUuid: "session",
    });
    expect(db.trainingAttempt.update.mock.calls[0][0].where).toEqual({
      uuid: "attempt",
    });
    expect(effects.invalidate).not.toHaveBeenCalled();
    expect(effects.warning).not.toHaveBeenCalled();
  });
  it("accepts the same submitted payload and rejects changed data", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      status: "SUBMITTED",
      payload: report,
    });
    expect((await invoke(submitReport, request(report))).statusCode).toBe(200);
    expect(
      (await invoke(submitReport, request({ ...report, notes: "changed" })))
        .statusCode,
    ).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    { teamNumber: 111 },
    { scouterUuid: "19ad7ac1-4f7c-46ae-aa94-d9d70b387873" },
    { startTime: startTime + 1 },
  ])("rejects changing the draft's identity", async (fields) => {
    expect(
      (await invoke(submitReport, request({ ...report, ...fields })))
        .statusCode,
    ).toBe(409);
  });
  it("requires the ended state", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      status: "STARTED",
    });
    expect((await invoke(submitReport, request(report))).statusCode).toBe(409);
  });
  it.each(
    [
      [[0, 99, 8]],
      [[0, 2, 99]],
      [
        [10, 0, 2],
        [20, 1, 2],
      ],
      [[10, 0, 2]],
      [
        [20, 0, 2],
        [10, 1, 2, 3],
      ],
      [
        [10, 0, 2],
        [151, 1, 2, 3],
      ],
    ].map((events) => ({ events })),
  )(
    "rejects malformed or out-of-order timelines ($events)",
    async ({ events }) => {
      expect(
        (await invoke(submitReport, request({ ...report, events }))).statusCode,
      ).toBe(400);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it("rejects missing matches without writing a report", async () => {
    db.teamMatchData.findFirst.mockResolvedValue(null);
    expect((await invoke(submitReport, request(report))).statusCode).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("does not create a report when the submission claim loses a race", async () => {
    db.scoutReportInProgress.updateMany.mockResolvedValue({ count: 0 });
    expect((await invoke(submitReport, request(report))).statusCode).toBe(409);
    expect(db.scoutReport.create).not.toHaveBeenCalled();
  });
  it("reports database conflicts and unexpected failures", async () => {
    db.scoutReport.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );
    expect((await invoke(submitReport, request(report))).statusCode).toBe(409);
    db.scoutReport.create.mockRejectedValueOnce(new Error("offline"));
    expect((await invoke(submitReport, request(report))).statusCode).toBe(500);
  });
  it("preserves competition cache and warning behavior", async () => {
    expect(
      (
        await invoke(
          submitReport,
          request({ ...report, robotBrokeDescription: "broke" }),
        )
      ).statusCode,
    ).toBe(200);
    expect(effects.invalidate).toHaveBeenCalledWith(254, "2026test");
    expect(effects.warning).toHaveBeenCalledWith(
      "BREAK",
      1,
      254,
      "2026test",
      uuid,
    );
  });
});

describe("Collection lifecycle recovery", () => {
  it.each([
    { handler: startMatch, body: { uuid, startTime } },
    { handler: endMatch, body: { uuid, endTime } },
  ])(
    "stops $handler.name when the draft is not accessible",
    async ({ handler, body }) => {
      db.scoutReportInProgress.findFirst.mockResolvedValue(null);
      expect((await invoke(handler, request(body))).statusCode).toBe(404);
      expect(db.scoutReportInProgress.updateMany).not.toHaveBeenCalled();
    },
  );

  it("does not start a draft after losing its state transition race", async () => {
    db.scoutReportInProgress.findFirst.mockResolvedValue({
      ...draft(),
      startedAt: null,
      status: "LOADED",
    });
    db.scoutReportInProgress.updateMany.mockResolvedValue({ count: 0 });
    expect(
      (await invoke(startMatch, request({ uuid, startTime }))).statusCode,
    ).toBe(409);
  });

  it.each([
    { handler: startMatch, body: { uuid, startTime } },
    { handler: endMatch, body: { uuid, endTime } },
  ])(
    "returns a controlled $handler.name error when persistence fails",
    async ({ handler, body }) => {
      db.scoutReportInProgress.findFirst.mockResolvedValue({
        ...draft(),
        startedAt: handler === startMatch ? null : new Date(startTime),
        endedAt: null,
      });
      db.scoutReportInProgress.updateMany.mockRejectedValue(
        new Error("database unavailable"),
      );
      const response = await invoke(handler, request(body));
      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty("displayError");
    },
  );

  it("still acknowledges a committed report when notification delivery fails", async () => {
    const error = new Error("notification unavailable");
    effects.invalidate.mockRejectedValue(error);
    effects.warning.mockRejectedValue(error);
    const response = await invoke(
      submitReport,
      request({ ...report, robotBrokeDescription: "Broken wheel" }),
    );
    expect(response.statusCode).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      "Failed to invalidate report cache",
      error,
    );
    expect(console.error).toHaveBeenCalledWith(
      "Failed to send robot break warning",
      error,
    );
  });
});
