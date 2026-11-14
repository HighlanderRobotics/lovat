import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  activityMatchLabel,
  buildActivityState,
  ScheduledMatch,
} from "../src/liveActivities/state.js";
import { activityPushPayload } from "../src/liveActivities/apns.js";

const mocks = vi.hoisted(() => ({
  registeredTeam: { findUnique: vi.fn() },
  scouter: { findFirst: vi.fn() },
  tournament: { findUnique: vi.fn() },
  scouterScheduleShift: { findMany: vi.fn() },
  teamMatchData: { findMany: vi.fn() },
  values: new Map<string, string>(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: mocks }));
vi.mock("../src/redisClient.js", () => ({
  kv: {
    get: async (key: string) => mocks.values.get(key) ?? null,
    setEx: async (key: string, data: string) => {
      mocks.values.set(key, data);
    },
    del: async (key: string) => {
      mocks.values.delete(key);
    },
  },
}));
const { liveActivityRoutes } = await import("../src/liveActivities/routes.js");
const { errorHandler } = await import("../src/lib/errors.js");
const { scoutingActivityState } =
  await import("../src/liveActivities/schedule.js");
const app = express()
  .use(express.json())
  .use(liveActivityRoutes)
  .use(errorHandler);
const scout = "aa9a7c09-9d69-4ff1-a4ba-f97763c09e22";
const installation = "eb2f5a42-258a-4da4-83b1-319b694a8984";
const headers = { "x-team-code": "team-code", "x-scouter-uuid": scout };
const match = (ordinal: number, assignment = false): ScheduledMatch => ({
  ordinal,
  matchKey: `q${ordinal}`,
  matchLabel: `Q${ordinal}`,
  complete: false,
  startTime: null,
  assignment: assignment ? { teamNumber: 8433, submitted: false } : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.values.clear();
  mocks.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
  mocks.scouter.findFirst.mockResolvedValue({ uuid: scout });
  mocks.tournament.findUnique.mockResolvedValue({ name: "Test tournament" });
  mocks.scouterScheduleShift.findMany.mockResolvedValue([]);
  mocks.teamMatchData.findMany.mockResolvedValue([]);
});

describe("scouting activity content", () => {
  it("labels qualifiers, playoffs, and official final series correctly", () => {
    expect(activityMatchLabel("QUALIFICATION", 28)).toBe("Q28");
    expect(activityMatchLabel("ELIMINATION", 12)).toBe("P12");
    expect(
      activityMatchLabel("ELIMINATION", 15, {
        competitionLevel: "FINAL",
        matchNumber: 2,
      }),
    ).toBe("F2");
    expect(activityMatchLabel("PRACTICE", 1)).toBe("PM1");
  });

  it("waits until the scout's next assignment, then switches on shift", () => {
    const matches = [match(29, true), match(27), match(28, true)];
    expect(buildActivityState(matches, "Test", 123000)?.phase).toBe("waiting");
    matches[1].complete = true;
    expect(buildActivityState(matches, "Test", 123000)).toMatchObject({
      phase: "onShift",
      nowMatch: "Q28",
      updatedAt: 123,
      assignments: [
        { matchLabel: "Q28", teamNumber: 8433 },
        { matchLabel: "Q29", teamNumber: 8433 },
      ],
    });
  });

  it("advances past official completions and submitted scout reports", () => {
    const first = { ...match(28, true), complete: true };
    const second = match(29, true);
    second.assignment!.submitted = true;
    expect(
      buildActivityState([first, second, match(30, true)], "Test")
        ?.assignments[0].matchLabel,
    ).toBe("Q30");
    expect(buildActivityState([first, second], "Test")).toBeNull();
  });

  it("limits the UI to the next assignment plus three rows", () => {
    expect(
      buildActivityState(
        [1, 2, 3, 4, 5].map((i) => match(i, true)),
        "Test",
      )?.assignments,
    ).toHaveLength(4);
  });

  it("creates Apple's start/update/end envelopes and stale dates", () => {
    const state = buildActivityState([match(28, true)], "Test")!;
    const start = activityPushPayload("start", state, {
      tournamentKey: "event",
      scouterUuid: scout,
    });
    expect(start.aps).toMatchObject({
      event: "start",
      "attributes-type": "ScoutingActivityAttributes",
      attributes: { scouterUuid: scout, preview: false },
    });
    expect(start.aps["stale-date"]).toBeGreaterThan(start.aps.timestamp);
    expect(activityPushPayload("update", state).aps["content-state"]).toBe(
      state,
    );
    expect(activityPushPayload("end", state).aps["dismissal-date"]).toBeTypeOf(
      "number",
    );
  });
});

describe("device ownership and assignment selection", () => {
  const body = {
    installationId: installation,
    tournamentKey: "event",
    token: "a".repeat(64),
    kind: "update",
    activityId: "activity",
    environment: "sandbox",
  };

  it("rejects missing identities, invalid team codes, and scouts on another team", async () => {
    expect((await request(app).get("/live-activities/event")).status).toBe(400);
    mocks.registeredTeam.findUnique.mockResolvedValueOnce(null);
    expect(
      (await request(app).get("/live-activities/event").set(headers)).status,
    ).toBe(401);
    mocks.scouter.findFirst.mockResolvedValueOnce(null);
    expect(
      (await request(app).get("/live-activities/event").set(headers)).status,
    ).toBe(404);
  });

  it("keeps registrations owned by their source team and scout", async () => {
    expect(
      (await request(app).post("/live-activities").set(headers).send(body))
        .status,
    ).toBe(200);
    mocks.registeredTeam.findUnique.mockResolvedValue({ number: 254 });
    expect(
      (await request(app).post("/live-activities").set(headers).send(body))
        .status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .delete(`/live-activities/${installation}`)
          .set(headers)
      ).status,
    ).toBe(404);
    expect(mocks.values.size).toBe(1);
  });

  it("validates tokens and deletes registrations on disable", async () => {
    expect(
      (
        await request(app)
          .post("/live-activities")
          .set(headers)
          .send({ ...body, token: "not-a-token" })
      ).status,
    ).toBe(400);
    await request(app).post("/live-activities").set(headers).send(body);
    expect(
      (
        await request(app)
          .delete(`/live-activities/${installation}`)
          .set(headers)
      ).status,
    ).toBe(204);
    expect(mocks.values.size).toBe(0);
  });

  it("saves the selected mascot style and supports registrations from older clients", async () => {
    await request(app)
      .post("/live-activities")
      .set(headers)
      .send(body)
      .expect(200);
    expect(JSON.parse([...mocks.values.values()][0]).mascotStyle).toBe("plain");
    await request(app)
      .post("/live-activities")
      .set(headers)
      .send({ ...body, mascotStyle: "original" })
      .expect(200);
    expect(JSON.parse([...mocks.values.values()][0]).mascotStyle).toBe(
      "original",
    );
    await request(app)
      .post("/live-activities")
      .set(headers)
      .send({ ...body, mascotStyle: "unknown-style" })
      .expect(400);
    expect(JSON.parse([...mocks.values.values()][0]).mascotStyle).toBe(
      "original",
    );
  });

  it("selects the team at the scout's assigned station, never the scout's source team", async () => {
    mocks.scouterScheduleShift.findMany.mockResolvedValue([
      {
        startMatchOrdinalNumber: 28,
        endMatchOrdinalNumber: 28,
        team1: [],
        team2: [],
        team3: [],
        team4: [],
        team5: [{ uuid: scout }],
        team6: [],
      },
    ]);
    mocks.teamMatchData.findMany.mockResolvedValue([
      {
        key: "e_qm28_0",
        matchType: "QUALIFICATION",
        matchNumber: 28,
        teamNumber: 8033,
        alliance: "RED",
        station: 1,
        scoutReports: [],
        match: null,
      },
      {
        key: "e_qm28_4",
        matchType: "QUALIFICATION",
        matchNumber: 28,
        teamNumber: 8433,
        alliance: "BLUE",
        station: 2,
        scoutReports: [],
        match: null,
      },
    ]);
    const state = await scoutingActivityState(8033, scout, "event");
    expect(state?.assignments[0].teamNumber).toBe(8433);
    expect(mocks.scouterScheduleShift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceTeamNumber: 8033, tournamentKey: "event" },
      }),
    );
    expect(mocks.teamMatchData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          scoutReports: expect.objectContaining({
            where: {
              scouterUuid: scout,
              scouter: { sourceTeamNumber: 8033 },
              training: false,
            },
          }),
        }),
      }),
    );
  });
});
