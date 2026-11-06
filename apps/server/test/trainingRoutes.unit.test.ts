import express from "express";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  trainingVideo: { findMany: vi.fn(), findUnique: vi.fn() },
  trainingSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  trainingAttempt: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  registeredTeam: { findUnique: vi.fn() },
  scouter: { findFirst: vi.fn() },
  scoutReportInProgress: { findUnique: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));
const service = vi.hoisted(() => ({
  read: vi.fn(),
  snapshot: vi.fn(),
  token: vi.fn(),
  grade: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/training/sessionService.js", async (original) => ({
  ...(await original<
    typeof import("../src/handler/training/sessionService.js")
  >()),
  readSession: service.read,
  snapshot: service.snapshot,
  token: service.token,
}));
vi.mock("../src/handler/training/gradeReport.js", () => ({
  gradeTrainingReport: service.grade,
}));
vi.mock("../src/handler/collection/submitReport.js", () => ({
  submitReport: service.submit,
}));
vi.mock("express-rate-limit", () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
import { trainingRoutes } from "../src/handler/training/training.routes.js";
import {
  hashToken,
  TrainingError,
} from "../src/handler/training/sessionService.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const videoId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const scoutId = "55555555-5555-4555-8555-555555555555";
const secret = "s".repeat(43);
const root = "/training/sessions/" + sessionId;
const video = () => ({
  uuid: videoId,
  matchKey: "match",
  videoLink: "https://example.invalid/video",
  alliance: "RED",
  startOffsetSeconds: 7,
  durationSeconds: 166,
  answerKeyReports: [
    {
      training: true,
      teamMatchData: {
        teamNumber: 118,
        tournamentKey: "2026joh",
        matchType: "QUALIFICATION",
        matchNumber: 19,
      },
    },
  ],
});
const participant = () => ({
  uuid: attemptId,
  ready: true,
  lastSeenAt: new Date(),
  report: null,
});
const state = () => ({
  uuid: sessionId,
  status: "LOBBY",
  sourceTeamNumber: null,
  targetTeamNumber: 118,
  pairingTokenHash: hashToken(secret),
  expiresAt: new Date(Date.now() + 60_000),
  startedAt: null,
  trainingVideo: video(),
  attempts: [participant()],
});
let app: express.Express;
let forwarded: unknown[];
const post = (path: string, body: object = {}) =>
  request(app)
    .post(path)
    .set("Authorization", "Bearer " + secret)
    .send(body);
const control = (action: string, fields: object = {}) =>
  post(root + "/control", { action, ...fields });
const join = () =>
  post("/train/" + sessionId, { pairingToken: secret, deviceName: "Tablet" })
    .set("x-team-code", "team-code")
    .set("x-scouter-uuid", scoutId)
    .set("x-device-id", "tablet");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  forwarded = [];
  app = express().use(express.json()).use(trainingRoutes);
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      forwarded.push(error);
      res.end();
    },
  );
  service.token.mockReturnValue(secret);
  service.read.mockResolvedValue(state());
  service.snapshot.mockResolvedValue({ uuid: sessionId, participants: [] });
  service.submit.mockImplementation(async (_req: Request, res: Response) => {
    res.json({ uuid: reportId });
  });
  service.grade.mockResolvedValue(undefined);
  db.$transaction.mockImplementation((callback) => callback(db));
  db.trainingVideo.findMany.mockResolvedValue([video()]);
  db.trainingVideo.findUnique.mockResolvedValue(video());
  db.trainingSession.create.mockResolvedValue({ uuid: sessionId });
  db.trainingSession.findUnique.mockResolvedValue(state());
  db.trainingSession.findUniqueOrThrow.mockResolvedValue(state());
  db.trainingAttempt.findFirst.mockResolvedValue(null);
  db.trainingAttempt.create.mockResolvedValue({ uuid: attemptId });
  db.trainingAttempt.update.mockResolvedValue({ uuid: attemptId });
  db.trainingAttempt.deleteMany.mockResolvedValue({ count: 1 });
  db.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
  db.scouter.findFirst.mockResolvedValue({ uuid: scoutId });
  db.scoutReportInProgress.findUnique.mockResolvedValue({
    uuid: reportId,
    mode: "TRAINING",
    trainingSessionUuid: sessionId,
    status: "LOADED",
    teamNumber: 118,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("training catalog and session creation", () => {
  it("lists only videos with one training answer key", async () => {
    const key = video().answerKeyReports[0];
    db.trainingVideo.findMany.mockResolvedValue([
      video(),
      { ...video(), answerKeyReports: [] },
      { ...video(), answerKeyReports: [key, key] },
      { ...video(), answerKeyReports: [{ ...key, training: false }] },
    ]);
    const response = await request(app).get("/training/videos");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ uuid: videoId, teamNumber: 118 });
    expect(response.body[0]).not.toHaveProperty("answerKeyReports");
  });
  it("returns secrets once and persists only hashes with a six-hour expiry", async () => {
    const before = Date.now();
    const response = await post("/training/sessions", { videoUuid: videoId });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      uuid: sessionId,
      browserToken: secret,
      pairingToken: secret,
    });
    const saved = db.trainingSession.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({
      trainingVideoUuid: videoId,
      targetTeamNumber: 118,
      browserTokenHash: hashToken(secret),
      pairingTokenHash: hashToken(secret),
    });
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 6 * 60 * 60_000,
    );
    expect(saved).not.toHaveProperty("browserToken");
  });
  it.each([
    { value: null },
    { value: { ...video(), answerKeyReports: [] } },
    {
      value: {
        ...video(),
        answerKeyReports: [
          video().answerKeyReports[0],
          video().answerKeyReports[0],
        ],
      },
    },
    {
      value: {
        ...video(),
        answerKeyReports: [{ ...video().answerKeyReports[0], training: false }],
      },
    },
  ])(
    "rejects unavailable or ambiguous exercises ($value)",
    async ({ value }) => {
      db.trainingVideo.findUnique.mockResolvedValue(value);
      expect(
        (await post("/training/sessions", { videoUuid: videoId })).status,
      ).toBe(404);
      expect(db.trainingSession.create).not.toHaveBeenCalled();
    },
  );
  it("reports invalid bodies and unexpected storage failures", async () => {
    expect((await post("/training/sessions", {})).status).toBe(400);
    db.trainingVideo.findMany.mockRejectedValue(new Error("offline"));
    expect((await request(app).get("/training/videos")).status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("pairing a Collection scout", () => {
  it.each([false, true])(
    "creates or refreshes the device's own attempt (existing: %s)",
    async (existing) => {
      db.trainingSession.findUnique.mockResolvedValue({
        ...state(),
        sourceTeamNumber: existing ? 8033 : null,
      });
      db.trainingAttempt.findFirst.mockResolvedValue(
        existing ? { uuid: attemptId } : null,
      );
      const response = await join();
      expect(response.status).toBe(200);
      expect(response.body.attemptUuid).toBe(attemptId);
      const write = existing
        ? db.trainingAttempt.update
        : db.trainingAttempt.create;
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accessTokenHash: hashToken(secret),
            deviceName: "Tablet",
          }),
        }),
      );
      expect(db.scouter.findFirst).toHaveBeenCalledWith({
        where: { uuid: scoutId, sourceTeamNumber: 8033, archived: false },
      });
      expect(db.trainingSession.update).toHaveBeenCalledWith({
        where: { uuid: sessionId },
        data: { sourceTeamNumber: 8033 },
      });
    },
  );
  it.each(["team", "scout"])(
    "rejects invalid %s credentials before claiming a session",
    async (kind) => {
      if (kind === "team") {
        db.registeredTeam.findUnique.mockResolvedValue(null);
      } else {
        db.scouter.findFirst.mockResolvedValue(null);
      }
      expect((await join()).status).toBe(401);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    { fields: null, status: 404 },
    { fields: { pairingTokenHash: "wrong" }, status: 404 },
    { fields: { expiresAt: new Date(0) }, status: 410 },
    { fields: { status: "PLAYING" }, status: 409 },
    { fields: { sourceTeamNumber: 971 }, status: 403 },
  ])("rejects invalid pairing state ($status)", async ({ fields, status }) => {
    db.trainingSession.findUnique.mockResolvedValue(
      fields === null ? null : { ...state(), ...fields },
    );
    expect((await join()).status).toBe(status);
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    expect(db.trainingAttempt.create).not.toHaveBeenCalled();
  });
});

describe("snapshot and readiness", () => {
  it("serves a browser snapshot without a participant heartbeat", async () => {
    expect(
      (
        await request(app)
          .get(root)
          .set("Authorization", "Bearer " + secret)
      ).status,
    ).toBe(200);
    expect(service.snapshot).toHaveBeenCalledWith(sessionId, secret, undefined);
    expect(db.trainingAttempt.updateMany).not.toHaveBeenCalled();
  });
  it("authenticates a participant before updating its throttled heartbeat", async () => {
    expect(
      (
        await request(app)
          .get(root)
          .query({ attempt: attemptId })
          .set("Authorization", "Bearer " + secret)
      ).status,
    ).toBe(200);
    expect(service.read).toHaveBeenCalledWith(sessionId, secret, attemptId);
    expect(db.trainingAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          uuid: attemptId,
          sessionUuid: sessionId,
        }),
      }),
    );
  });
  it("passes an absent token through authorization and does not change state", async () => {
    service.read.mockRejectedValue(new TrainingError(404, "Not found"));
    expect(
      (await request(app).get(root).query({ attempt: attemptId })).status,
    ).toBe(404);
    expect(service.read).toHaveBeenCalledWith(sessionId, "", attemptId);
    expect(db.trainingAttempt.updateMany).not.toHaveBeenCalled();
  });
  it.each([undefined, "LOBBY", "ARMED"])(
    "marks a loaded matching robot ready for stage %s",
    async (stage) => {
      db.trainingSession.findUniqueOrThrow.mockResolvedValue({
        ...state(),
        status: stage ?? "LOBBY",
      });
      expect(
        (
          await post(root + "/ready", {
            attemptUuid: attemptId,
            ...(stage ? { stage } : {}),
          })
        ).status,
      ).toBe(200);
      expect(db.trainingAttempt.update).toHaveBeenCalledWith({
        where: { uuid: attemptId },
        data: { ready: true, lastSeenAt: expect.any(Date) },
      });
    },
  );
  it.each([
    { status: "PLAYING", stage: undefined, draft: undefined },
    { status: "ARMED", stage: "LOBBY", draft: undefined },
    { status: "LOBBY", stage: undefined, draft: null },
    {
      status: "LOBBY",
      stage: undefined,
      draft: { status: "STARTED", teamNumber: 118 },
    },
    {
      status: "LOBBY",
      stage: undefined,
      draft: { status: "LOADED", teamNumber: 971 },
    },
  ])(
    "does not mark a stale or mismatched draft ready (%j)",
    async ({ status, stage, draft }) => {
      db.trainingSession.findUniqueOrThrow.mockResolvedValue({
        ...state(),
        status,
      });
      if (draft !== undefined) {
        db.scoutReportInProgress.findUnique.mockResolvedValue(draft);
      }
      expect(
        (
          await post(root + "/ready", {
            attemptUuid: attemptId,
            ...(stage ? { stage } : {}),
          })
        ).status,
      ).toBe(409);
      expect(db.trainingAttempt.update).not.toHaveBeenCalled();
    },
  );
});

describe("browser playback controls", () => {
  it("arms ready scouts, then requires a separate starting-pose confirmation", async () => {
    expect((await control("arm")).status).toBe(200);
    expect(db.trainingSession.update).toHaveBeenCalledWith({
      where: { uuid: sessionId },
      data: { status: "ARMED" },
    });
    expect(db.trainingAttempt.updateMany).toHaveBeenCalledWith({
      where: { sessionUuid: sessionId },
      data: { ready: false },
    });
  });
  it("starts playback only after the armed scouts confirm readiness", async () => {
    db.trainingSession.findUniqueOrThrow.mockResolvedValue({
      ...state(),
      status: "ARMED",
    });
    expect((await control("play")).status).toBe(200);
    expect(db.trainingSession.update).toHaveBeenCalledWith({
      where: { uuid: sessionId },
      data: { status: "PLAYING", startedAt: expect.any(Date) },
    });
  });
  it.each([
    { action: "arm", status: "ARMED" },
    { action: "play", status: "PLAYING" },
    { action: "end", status: "ENDED" },
    { action: "interrupt", status: "ENDED" },
    { action: "interrupt", status: "INTERRUPTED" },
  ])(
    "accepts retries of $action without another transition",
    async ({ action, status }) => {
      db.trainingSession.findUniqueOrThrow.mockResolvedValue({
        ...state(),
        status,
      });
      expect((await control(action)).status).toBe(200);
      expect(db.trainingSession.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    { action: "arm", status: "PLAYING", attempts: [participant()] },
    { action: "arm", status: "LOBBY", attempts: [] },
    {
      action: "arm",
      status: "LOBBY",
      attempts: [{ ...participant(), ready: false }],
    },
    {
      action: "arm",
      status: "LOBBY",
      attempts: [{ ...participant(), lastSeenAt: new Date(0) }],
    },
    { action: "play", status: "LOBBY", attempts: [participant()] },
    { action: "play", status: "ARMED", attempts: [] },
    {
      action: "play",
      status: "ARMED",
      attempts: [{ ...participant(), ready: false }],
    },
    {
      action: "play",
      status: "ARMED",
      attempts: [{ ...participant(), lastSeenAt: new Date(0) }],
    },
  ])(
    "rejects $action in an unready session (%j)",
    async ({ action, status, attempts }) => {
      db.trainingSession.findUniqueOrThrow.mockResolvedValue({
        ...state(),
        status,
        attempts,
      });
      expect((await control(action)).status).toBe(409);
      expect(db.trainingSession.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    { status: "LOBBY", startedAt: null, trainingVideo: video() },
    { status: "PLAYING", startedAt: null, trainingVideo: video() },
    { status: "PLAYING", startedAt: new Date(), trainingVideo: null },
    { status: "PLAYING", startedAt: new Date(), trainingVideo: video() },
  ])(
    "rejects ending before playback and its post-roll finish (%j)",
    async (fields) => {
      db.trainingSession.findUniqueOrThrow.mockResolvedValue({
        ...state(),
        ...fields,
      });
      expect((await control("end")).status).toBe(409);
      expect(db.trainingSession.update).not.toHaveBeenCalled();
    },
  );
  it("ends at the match clock cutoff after the post-roll has elapsed", async () => {
    const startedAt = new Date(Date.now() - 182_000);
    db.trainingSession.findUniqueOrThrow.mockResolvedValue({
      ...state(),
      status: "PLAYING",
      startedAt,
    });
    expect((await control("end")).status).toBe(200);
    expect(db.trainingSession.update).toHaveBeenCalledWith({
      where: { uuid: sessionId },
      data: {
        status: "ENDED",
        endedAt: new Date(startedAt.getTime() + 166_000),
      },
    });
  });
  it.each([
    {
      startedAt: null,
      trainingVideo: video(),
      playback: undefined,
      completed: false,
    },
    {
      startedAt: new Date(0),
      trainingVideo: null,
      playback: undefined,
      completed: false,
    },
    {
      startedAt: new Date(Date.now() + 60_000),
      trainingVideo: video(),
      playback: 166,
      completed: false,
    },
    {
      startedAt: new Date(0),
      trainingVideo: video(),
      playback: undefined,
      completed: false,
    },
    {
      startedAt: new Date(0),
      trainingVideo: video(),
      playback: 165,
      completed: false,
    },
    {
      startedAt: new Date(0),
      trainingVideo: video(),
      playback: 166,
      completed: true,
    },
  ])(
    "preserves completion evidence when interrupting (%j)",
    async ({ startedAt, trainingVideo, playback, completed }) => {
      db.trainingSession.findUniqueOrThrow.mockResolvedValue({
        ...state(),
        status: "PLAYING",
        startedAt,
        trainingVideo,
      });
      expect(
        (
          await control(
            "interrupt",
            playback === undefined ? {} : { playbackSeconds: playback },
          )
        ).status,
      ).toBe(200);
      expect(db.trainingSession.update).toHaveBeenCalledWith({
        where: { uuid: sessionId },
        data: completed
          ? { status: "ENDED", endedAt: new Date(166_000) }
          : { status: "INTERRUPTED" },
      });
    },
  );
});

describe("participant removal and training submissions", () => {
  it.each([0, 1])(
    "removes only lobby participants (matching rows: %i)",
    async (count) => {
      db.trainingAttempt.deleteMany.mockResolvedValue({ count });
      expect(
        (
          await request(app)
            .delete(root + "/participants/" + attemptId)
            .set("Authorization", "Bearer " + secret)
        ).status,
      ).toBe(count ? 204 : 409);
      expect(db.trainingAttempt.deleteMany).toHaveBeenCalledWith({
        where: {
          uuid: attemptId,
          sessionUuid: sessionId,
          session: { status: "LOBBY" },
        },
      });
    },
  );
  it("grades finalized reports and skips participants without submissions", async () => {
    service.read.mockResolvedValue({
      ...state(),
      attempts: [
        { report: null },
        { report: { finalizedReport: null } },
        { report: { finalizedReport: { uuid: reportId } } },
      ],
    });
    expect((await post(root + "/grade")).status).toBe(200);
    expect(service.grade).toHaveBeenCalledExactlyOnceWith(reportId);
  });
  it.each([
    null,
    { mode: "COMPETITION", trainingSessionUuid: sessionId },
    { mode: "TRAINING", trainingSessionUuid: "other" },
  ])(
    "rejects submissions outside this training session (%j)",
    async (draft) => {
      db.scoutReportInProgress.findUnique.mockResolvedValue(draft);
      expect(
        (await post("/training/" + sessionId + "/submit", { uuid: reportId }))
          .status,
      ).toBe(404);
      expect(service.submit).not.toHaveBeenCalled();
    },
  );
  it.each([null, { status: "LOBBY" }])(
    "requires an ended session before submission (%j)",
    async (session) => {
      db.trainingSession.findUnique.mockResolvedValue(session);
      expect(
        (await post("/training/" + sessionId + "/submit", { uuid: reportId }))
          .status,
      ).toBe(409);
      expect(service.submit).not.toHaveBeenCalled();
    },
  );
  it.each([200, 400])(
    "grades only a successful delegated report response (%i)",
    async (status) => {
      db.trainingSession.findUnique.mockResolvedValue({
        ...state(),
        status: "ENDED",
      });
      service.submit.mockImplementation(
        async (_req: Request, res: Response) => {
          res.status(status).json({ uuid: reportId });
        },
      );
      expect(
        (await post("/training/" + sessionId + "/submit", { uuid: reportId }))
          .status,
      ).toBe(status);
      expect(service.grade).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    },
  );
  it("acknowledges the saved submission when grading must retry later", async () => {
    const error = new Error("grading offline");
    db.trainingSession.findUnique.mockResolvedValue({
      ...state(),
      status: "ENDED",
    });
    service.grade.mockRejectedValue(error);
    expect(
      (await post("/training/" + sessionId + "/submit", { uuid: reportId }))
        .status,
    ).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      "Training grading pending",
      error,
    );
  });
  it("forwards failures after a response without trying to send it again", async () => {
    const error = new Error("late failure");
    db.trainingSession.findUnique.mockResolvedValue({
      ...state(),
      status: "ENDED",
    });
    service.submit.mockImplementation(async (_req: Request, res: Response) => {
      res.json({ uuid: reportId });
      throw error;
    });
    expect(
      (await post("/training/" + sessionId + "/submit", { uuid: reportId }))
        .status,
    ).toBe(200);
    expect(forwarded).toContain(error);
  });
});
