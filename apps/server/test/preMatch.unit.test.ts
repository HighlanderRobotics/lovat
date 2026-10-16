import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  registeredTeam: { findUnique: vi.fn() },
  scouter: { findFirst: vi.fn() },
  match: { findUnique: vi.fn() },
  teamMatchData: { findFirst: vi.fn() },
  trainingAttempt: { findFirst: vi.fn() },
  scoutReportInProgress: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/lovat_test";
const { preMatch } = await import("../src/handler/collection/preMatch.js");
const { Prisma } = await import("@lovat/db");
const uuid = "9cf5d6ae-724d-48db-9c6b-5f7c9c9b8e7e";
const scout = "19ad7ac1-4f7c-46ae-aa94-d9d70b387873";
const attemptUuid = "e3a8cce8-c3de-4ea1-a7c9-1c5f48014518";
const request = {
  body: { uuid },
  params: { match: "2025test_qm1", team: "254" },
  headers: {
    "x-team-code": "code",
    "x-device-id": "device",
    "x-scouter-uuid": scout,
  },
};
const match = {
  key: "2025test_qm1",
  tournamentKey: "2025test",
  tournament: { seasonYear: 2025 },
  teamSlots: [
    {
      key: "2025test_qm1_254",
      teamNumber: 254,
      matchType: "QUALIFICATION",
      matchNumber: 1,
    },
  ],
};
const row = () => ({
  uuid,
  sourceTeamNumber: 8033,
  scouterUuid: scout,
  tournamentKey: match.tournamentKey,
  matchType: "QUALIFICATION",
  matchNumber: 1,
  teamNumber: 254,
  trainingAttemptUuid: null,
  status: "LOADED",
  revision: 0,
  mode: "COMPETITION",
  expiresAt: new Date(Date.now() + 60_000),
  updatedAt: new Date(),
  payload: {},
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
  db.scouter.findFirst.mockResolvedValue({ uuid: scout });
  db.match.findUnique.mockResolvedValue(match);
  db.scoutReportInProgress.findUnique.mockResolvedValue(null);
  db.scoutReportInProgress.create.mockImplementation(({ data }) =>
    Promise.resolve({ ...row(), ...data }),
  );
  db.trainingAttempt.findFirst.mockResolvedValue({
    uuid: attemptUuid,
    sessionUuid: "session",
    submittedAt: null,
    session: {
      expiresAt: new Date(Date.now() + 60_000),
      trainingVideo: {
        matchKey: match.key,
        answerKeyReports: [{ teamMatchKey: match.teamSlots[0].key }],
      },
    },
  });
});
afterEach(() => vi.restoreAllMocks());
describe("prepare a Collection match report", () => {
  it("uses verified ownership, the match season, and the robot's report identity", async () => {
    const result = await invoke(preMatch, request);
    expect(result.statusCode).toBe(201);
    expect(db.scouter.findFirst).toHaveBeenCalledWith({
      where: { uuid: scout, sourceTeamNumber: 8033, archived: false },
    });
    const data = db.scoutReportInProgress.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      uuid,
      sourceTeamNumber: 8033,
      scouterUuid: scout,
      deviceId: "device",
      seasonYear: 2025,
      schemaVersion: 1,
      mode: "COMPETITION",
      tournamentKey: "2025test",
      matchType: "QUALIFICATION",
      matchNumber: 1,
      teamNumber: 254,
      payload: { uuid, scouterUuid: scout, events: [] },
    });
    expect(data.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 86_400_000,
    );
  });
  it.each([
    {},
    { "x-team-code": "code" },
    { ...request.headers, "x-scouter-uuid": [scout] },
  ])("rejects missing or malformed headers", async (headers) => {
    expect((await invoke(preMatch, { ...request, headers })).statusCode).toBe(
      400,
    );
    expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.5", "NaN"])(
    "rejects invalid robot number %s",
    async (team) => {
      expect(
        (
          await invoke(preMatch, {
            ...request,
            params: { ...request.params, team },
          })
        ).statusCode,
      ).toBe(400);
    },
  );
  it("requires a client-generated report UUID", async () => {
    expect((await invoke(preMatch, { ...request, body: {} })).statusCode).toBe(
      400,
    );
  });
  it("rejects an invalid team code before checking match data", async () => {
    db.registeredTeam.findUnique.mockResolvedValue(null);
    expect((await invoke(preMatch, request)).statusCode).toBe(401);
    expect(db.match.findUnique).not.toHaveBeenCalled();
  });
  it("rejects scouts outside the team or archived", async () => {
    db.scouter.findFirst.mockResolvedValue(null);
    expect((await invoke(preMatch, request)).statusCode).toBe(404);
    expect(db.scoutReportInProgress.create).not.toHaveBeenCalled();
  });
  it.each([null, { ...match, teamSlots: [] }])(
    "rejects unavailable matches or robots",
    async (value) => {
      db.match.findUnique.mockResolvedValue(value);
      expect((await invoke(preMatch, request)).statusCode).toBe(404);
      expect(db.scoutReportInProgress.create).not.toHaveBeenCalled();
    },
  );
  it("derives legacy season from tournament key", async () => {
    db.match.findUnique.mockResolvedValue({
      ...match,
      tournament: { seasonYear: null },
    });
    expect((await invoke(preMatch, request)).statusCode).toBe(201);
    expect(
      db.scoutReportInProgress.create.mock.calls[0][0].data.seasonYear,
    ).toBe(2025);
  });
  it("does not guess an unknown season", async () => {
    db.match.findUnique.mockResolvedValue({
      ...match,
      tournamentKey: "unknown",
      tournament: { seasonYear: null },
    });
    expect((await invoke(preMatch, request)).statusCode).toBe(409);
  });
  it("returns the existing client UUID on retry without creating another", async () => {
    db.scoutReportInProgress.findUnique.mockResolvedValue(row());
    expect((await invoke(preMatch, request)).statusCode).toBe(200);
    expect(db.scoutReportInProgress.create).not.toHaveBeenCalled();
  });
  it.each([
    { teamNumber: 111 },
    { sourceTeamNumber: 111 },
    { expiresAt: new Date(0) },
    { status: "ABANDONED" },
  ])("rejects conflicting, foreign, or expired drafts", async (extra) => {
    db.scoutReportInProgress.findUnique.mockResolvedValue({
      ...row(),
      ...extra,
    });
    const expected = extra.teamNumber
      ? 409
      : extra.sourceTeamNumber
        ? 404
        : 410;
    expect((await invoke(preMatch, request)).statusCode).toBe(expected);
  });
  it("returns a retryable conflict for a simultaneous duplicate creation", async () => {
    db.scoutReportInProgress.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );
    expect((await invoke(preMatch, request)).statusCode).toBe(409);
    expect(db.scoutReportInProgress.create).toHaveBeenCalledTimes(1);

    db.scoutReportInProgress.findUnique.mockResolvedValue(row());
    expect((await invoke(preMatch, request)).statusCode).toBe(200);
  });
  it("accepts retries from another device without resetting the report", async () => {
    db.scoutReportInProgress.findUnique.mockResolvedValue(row());
    const result = await invoke(preMatch, {
      ...request,
      headers: { ...request.headers, "x-device-id": "another-device" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ uuid });
    expect(db.scoutReportInProgress.create).not.toHaveBeenCalled();
  });
  it("binds training drafts to their owned attempt and selected exercise", async () => {
    const result = await invoke(preMatch, {
      ...request,
      body: { uuid, trainingAttemptUuid: attemptUuid },
    });
    expect(result.statusCode).toBe(201);
    expect(db.trainingAttempt.findFirst.mock.calls[0][0].where).toEqual({
      uuid: attemptUuid,
      scouterUuid: scout,
      session: { sourceTeamNumber: 8033 },
    });
    expect(db.scoutReportInProgress.create.mock.calls[0][0].data).toMatchObject(
      {
        mode: "TRAINING",
        trainingSessionUuid: "session",
        trainingAttemptUuid: attemptUuid,
      },
    );
  });
  it.each([
    null,
    { submittedAt: new Date() },
    { session: { expiresAt: new Date(0) } },
    {
      session: {
        expiresAt: new Date(Date.now() + 60_000),
        trainingVideo: { matchKey: "other", answerKeyReports: [] },
      },
    },
  ])("rejects unavailable training attempts", async (value) => {
    const base = await db.trainingAttempt.findFirst();
    db.trainingAttempt.findFirst.mockResolvedValue(
      value === null ? null : { ...base, ...value },
    );
    const result = await invoke(preMatch, {
      ...request,
      body: { uuid, trainingAttemptUuid: attemptUuid },
    });
    expect([404, 409, 410]).toContain(result.statusCode);
    expect(db.scoutReportInProgress.create).not.toHaveBeenCalled();
  });
  it("returns a controlled failure when persistence fails", async () => {
    db.scoutReportInProgress.create.mockRejectedValue(
      new Error("database offline"),
    );
    expect((await invoke(preMatch, request)).statusCode).toBe(500);
  });
});

describe("Collection match identity loading", () => {
  it("resolves manual match identity through the imported slot", async () => {
    db.teamMatchData.findFirst.mockResolvedValue({ matchKey: match.key });
    const result = await invoke(preMatch, {
      ...request,
      params: {},
      body: {
        uuid,
        teamNumber: 254,
        matchIdentity: {
          tournamentKey: "2025test",
          matchType: "ELIMINATION",
          matchNumber: 7,
        },
      },
    });
    expect(result.statusCode).toBe(201);
    expect(db.teamMatchData.findFirst).toHaveBeenCalledWith({
      where: {
        tournamentKey: "2025test",
        matchType: "ELIMINATION",
        matchNumber: 7,
        teamNumber: 254,
      },
      select: { matchKey: true },
    });
    expect(db.match.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: match.key } }),
    );
  });

  it("rejects a match that has not been imported", async () => {
    db.teamMatchData.findFirst.mockResolvedValue(null);
    const result = await invoke(preMatch, {
      ...request,
      params: {},
      body: {
        uuid,
        teamNumber: 254,
        matchIdentity: {
          tournamentKey: "2025test",
          matchType: "QUALIFICATION",
          matchNumber: 1,
        },
      },
    });
    expect(result.statusCode).toBe(404);
    expect(db.scoutReportInProgress.create).not.toHaveBeenCalled();
  });

  it("rejects an incomplete identity before accessing the database", async () => {
    const result = await invoke(preMatch, {
      ...request,
      params: {},
      body: { uuid, teamNumber: 254 },
    });
    expect(result.statusCode).toBe(400);
    expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
  });
});
