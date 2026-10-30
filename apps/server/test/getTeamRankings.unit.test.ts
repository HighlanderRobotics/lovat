import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";

vi.mock("../src/prismaClient.js", () => ({
  default: {
    teamMatchData: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
  },
}));

const { getTeamRankings } =
  await import("../src/handler/manager/tournament/getTeamRankings.js");
const prismaClient = (await import("../src/prismaClient.js")).default;

const tbaTeam = (number: number) => ({
  number,
  name: `Team ${number}`,
  offseasonName: null,
  city: null,
  stateProv: null,
  country: null,
  website: null,
  robotName: null,
  robotPhotoUrl: null,
  homeCMPediaUrl: null,
  homeChampionshipMediaUrl: null,
  hasCascaded: false,
});

const tbaStatus = (rank: number | null, matchesPlayed: number) => ({
  qual: {
    ranking: {
      rank,
      matches_played: matchesPlayed,
      sort_orders: [1.5, 0.5, 0.25],
    },
  },
});

const buildApp = (onError?: (error: unknown) => void) => {
  const app = express();
  app.get("/v1/manager/tournament/:tournament/rankedTeams", getTeamRankings);
  app.use((error: unknown, _req, res, next) => {
    onError?.(error);
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(500).json({ message: "unhandled" });
  });
  return app;
};

const request = async (tournamentKey = "2024test") => {
  const { default: supertest } = await import("supertest");
  const errors: unknown[] = [];
  const response = await supertest(buildApp((error) => errors.push(error))).get(
    `/v1/manager/tournament/${tournamentKey}/rankedTeams`,
  );
  return { response, errors };
};

afterEach(() => vi.unstubAllEnvs());

describe("getTeamRankings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(prismaClient.teamMatchData.findMany).mockResolvedValue([
      { teamNumber: 254 },
      { teamNumber: 1 },
    ] as never);
    vi.mocked(prismaClient.team.findMany).mockResolvedValue([
      tbaTeam(254),
      tbaTeam(1),
    ] as never);
  });

  it("attaches qualification rankings from TBA keyed by team number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          frc254: tbaStatus(3, 12),
          frc1: tbaStatus(1, 12),
        }),
      }),
    );

    const { response, errors } = await request();
    expect(errors).toEqual([]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        number: 254,
        name: "Team 254",
        rank: 3,
        matchesPlayed: 12,
        rankingPoints: 18,
      }),
      expect.objectContaining({
        number: 1,
        name: "Team 1",
        rank: 1,
        matchesPlayed: 12,
        rankingPoints: 18,
      }),
    ]);
  });

  it.each([
    {
      scenario: "prefers official RP over the calculated total",
      rankingPoints: 25,
      sortOrders: [1.5],
      expected: 25,
    },
    {
      scenario: "preserves an official RP total of zero",
      rankingPoints: 0,
      sortOrders: [1.5],
      expected: 0,
    },
    {
      scenario: "uses official RP even when sort orders are empty",
      rankingPoints: 25,
      sortOrders: [],
      expected: 25,
    },
    {
      scenario: "rounds the calculated total when official RP is missing",
      rankingPoints: undefined,
      sortOrders: [1.4167, 9],
      expected: 17,
    },
    {
      scenario: "calculates the total when official RP is null",
      rankingPoints: null,
      sortOrders: [1.4167, 9],
      expected: 17,
    },
    {
      scenario:
        "returns null when official RP is missing and sort orders are empty",
      rankingPoints: undefined,
      sortOrders: [],
      expected: null,
    },
    {
      scenario:
        "returns null when official RP is null and sort orders are empty",
      rankingPoints: null,
      sortOrders: [],
      expected: null,
    },
  ])("$scenario", async ({ rankingPoints, sortOrders, expected }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          frc254: {
            qual: {
              ranking: {
                ...tbaStatus(3, 12).qual.ranking,
                ...(rankingPoints === undefined
                  ? {}
                  : { ranking_points: rankingPoints }),
                sort_orders: sortOrders,
              },
            },
          },
        }),
      }),
    );

    const { response, errors } = await request();

    expect(errors).toEqual([]);
    expect(response.status).toBe(200);
    expect(
      response.body.find((team: { number: number }) => team.number === 254),
    ).toMatchObject({
      rank: 3,
      matchesPlayed: 12,
      rankingPoints: expected,
    });
  });

  it("includes the season avatar, official RP and TBA authentication", async () => {
    vi.stubEnv("TBA_KEY", "test-tba-key");
    vi.mocked(prismaClient.team.findMany).mockResolvedValue([
      {
        ...tbaTeam(254),
        seasons: [{ avatar: "data:image/png;base64,fixture" }],
      },
      { ...tbaTeam(1), seasons: [] },
    ] as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        frc254: {
          qual: {
            ranking: { ...tbaStatus(1, 12).qual.ranking, ranking_points: 25 },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { response } = await request("2026fixture");
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      number: 254,
      rank: 1,
      rankingPoints: 25,
      avatar: "data:image/png;base64,fixture",
    });
    expect(response.body[1].avatar).toBeNull();
    expect(response.body[0]).not.toHaveProperty("seasons");
    expect(prismaClient.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          seasons: {
            where: { seasonYear: 2026 },
            select: { avatar: true },
            take: 1,
          },
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.thebluealliance.com/api/v3/event/2026fixture/teams/statuses",
      { headers: { "X-TBA-Auth-Key": "test-tba-key" } },
    );
  });

  it("uses season zero when the tournament key has no numeric year", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    const { response, errors } = await request("offseason");

    expect(errors).toEqual([]);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(prismaClient.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          seasons: {
            where: { seasonYear: 0 },
            select: { avatar: true },
            take: 1,
          },
        },
      }),
    );
  });

  it("returns a single 200 response when TBA is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { response, errors } = await request();
    expect(errors).toEqual([]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ number: 254, rank: null, rankingPoints: null }),
      expect.objectContaining({ number: 1, rank: null, rankingPoints: null }),
    ]);
  });

  it("returns a single 200 response when TBA rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    const { response, errors } = await request();
    expect(errors).toEqual([]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it("leaves rankings null for teams TBA has not ranked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ frc254: tbaStatus(null, 2) }),
      }),
    );

    const { response, errors } = await request();
    expect(errors).toEqual([]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ number: 254, rank: null, matchesPlayed: 2 }),
      expect.objectContaining({ number: 1, rank: null, matchesPlayed: null }),
    ]);
  });

  it("returns 404 when the tournament has no match data", async () => {
    vi.mocked(prismaClient.teamMatchData.findMany).mockResolvedValue(
      [] as never,
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { response, errors } = await request("2024unknown");
    expect(errors).toEqual([]);

    expect(response.status).toBe(404);
    expect(response.text).toBe("Tournament or teams not found");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaClient.team.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when the tournament key is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { default: supertest } = await import("supertest");
    const app = express();
    app.get("/rankedTeams", getTeamRankings);

    const response = await supertest(app).get("/rankedTeams");

    expect(response.status).toBe(400);
    expect(prismaClient.teamMatchData.findMany).not.toHaveBeenCalled();
  });
});
it("returns a server error when tournament match lookup fails", async () => {
  vi.mocked(prismaClient.teamMatchData.findMany).mockRejectedValue(
    new Error("database"),
  );
  const { response, errors } = await request();
  expect(errors).toEqual([]);
  expect(response.status).toBe(500);
});
it("does not write another response when a failed request already sent headers", async () => {
  vi.mocked(prismaClient.teamMatchData.findMany).mockRejectedValue(
    new Error("database"),
  );
  const status = vi.fn();
  const { invoke } = await import("./helpers/handlerHarness.js");
  await invoke(
    (req) =>
      getTeamRankings(req, {
        headersSent: true,
        status,
      } as unknown as import("express").Response),
    { params: { tournament: "2026test" } },
  );
  expect(status).not.toHaveBeenCalled();
});
