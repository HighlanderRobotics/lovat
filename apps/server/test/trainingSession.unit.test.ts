import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ trainingSession: { findUnique: vi.fn() } }));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
import {
  hashToken,
  readSession,
  snapshot,
  token,
  TrainingError,
  videoDetails,
} from "../src/handler/training/sessionService.js";

const now = new Date("2026-11-01T12:00:00Z");
const video = () => ({
  uuid: "video",
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
const participant = (uuid = "attempt") => ({
  uuid,
  accessTokenHash: hashToken("participant-token"),
  scouter: { name: "Scout", sourceTeamNumber: 8033 },
  deviceName: "Tablet",
  ready: true,
  lastSeenAt: now,
  report: null,
});
const session = () => ({
  uuid: "session",
  browserTokenHash: hashToken("browser-token"),
  expiresAt: new Date(now.getTime() + 60_000),
  status: "LOBBY",
  startedAt: null,
  endedAt: null,
  trainingVideo: video(),
  attempts: [participant()],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db.trainingSession.findUnique.mockResolvedValue(session());
});
afterEach(() => vi.useRealTimers());

it("generates independent URL-safe session secrets and stable one-way hashes", () => {
  const first = token();
  expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(token()).not.toBe(first);
  expect(hashToken("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

describe("session token authorization", () => {
  it("accepts the browser token or the matching participant token", async () => {
    expect((await readSession("session", "browser-token")).uuid).toBe(
      "session",
    );
    expect(
      (await readSession("session", "participant-token", "attempt")).uuid,
    ).toBe("session");
  });
  it.each([
    { value: null, secret: "browser-token", attempt: undefined },
    { value: session(), secret: "", attempt: undefined },
    { value: session(), secret: "wrong-token", attempt: undefined },
    { value: session(), secret: "participant-token", attempt: "other-attempt" },
    { value: session(), secret: "wrong-token", attempt: "attempt" },
  ])(
    "hides unavailable sessions and rejects mismatched credentials (%j)",
    async ({ value, secret, attempt }) => {
      db.trainingSession.findUnique.mockResolvedValue(value);
      await expect(
        readSession("session", secret, attempt),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
  it("rejects a valid token after the session expires", async () => {
    db.trainingSession.findUnique.mockResolvedValue({
      ...session(),
      expiresAt: now,
    });
    await expect(readSession("session", "browser-token")).rejects.toMatchObject(
      { status: 410 },
    );
  });
  it("preserves the status and message on training errors", () => {
    const error = new TrainingError(409, "Wait for the video");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(409);
    expect(error.message).toBe("Wait for the video");
  });
});

describe("public training snapshots", () => {
  it.each([0, 2])("requires exactly one answer key (received %i)", (count) => {
    const value = video();
    value.answerKeyReports = Array.from(
      { length: count },
      () => value.answerKeyReports[0],
    );
    expect(() =>
      videoDetails(value as unknown as Parameters<typeof videoDetails>[0]),
    ).toThrow("exactly one robot answer key");
  });
  it("returns playback metadata without exposing the answer key", () => {
    const result = videoDetails(
      video() as unknown as Parameters<typeof videoDetails>[0],
    );
    expect(result).toMatchObject({
      teamNumber: 118,
      tournamentKey: "2026joh",
      durationSeconds: 166,
      startOffsetSeconds: 7,
      postMatchSeconds: 15,
    });
    expect(result).not.toHaveProperty("answerKeyReports");
  });
  it("does not publish a snapshot after its video is removed", async () => {
    db.trainingSession.findUnique.mockResolvedValue({
      ...session(),
      trainingVideo: null,
    });
    await expect(snapshot("session", "browser-token")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("reports connectivity, draft progress and final scores without credential hashes", async () => {
    db.trainingSession.findUnique.mockResolvedValue({
      ...session(),
      startedAt: now,
      endedAt: new Date(now.getTime() + 166_000),
      attempts: [
        {
          ...participant("connecting"),
          scouter: { name: null, sourceTeamNumber: 8033 },
          lastSeenAt: new Date(0),
        },
        {
          ...participant("ended"),
          report: { status: "ENDED", finalizedReport: null },
        },
        {
          ...participant("graded"),
          report: {
            status: "SUBMITTED",
            finalizedReport: {
              uuid: "report",
              trainingScores: [
                { overallScore: "87.5", breakdown: { quantities: [] } },
              ],
            },
          },
        },
        {
          ...participant("pending"),
          report: {
            status: "SUBMITTED",
            finalizedReport: { uuid: "pending-report", trainingScores: [] },
          },
        },
      ],
    });
    const result = await snapshot("session", "browser-token");
    expect(result.startedAt).toBe(now.getTime());
    expect(result.endedAt).toBe(now.getTime() + 166_000);
    expect(result.participants).toEqual([
      expect.objectContaining({
        uuid: "connecting",
        name: null,
        connected: false,
        status: "CONNECTING",
        reportUuid: null,
        score: null,
      }),
      expect.objectContaining({
        uuid: "ended",
        connected: true,
        status: "ENDED",
        reportUuid: null,
        score: null,
      }),
      expect.objectContaining({
        uuid: "graded",
        reportUuid: "report",
        score: { overallScore: 87.5, breakdown: { quantities: [] } },
      }),
      expect.objectContaining({
        uuid: "pending",
        reportUuid: "pending-report",
        score: null,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("TokenHash");
  });
  it("limits a participant snapshot to its own progress", async () => {
    db.trainingSession.findUnique.mockResolvedValue({
      ...session(),
      attempts: [participant(), participant("other")],
    });
    const result = await snapshot("session", "participant-token", "attempt");
    expect(result.startedAt).toBeNull();
    expect(result.endedAt).toBeNull();
    expect(result.participants.map((p) => p.uuid)).toEqual(["attempt"]);
  });
});
