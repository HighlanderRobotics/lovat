import { describe, expect, it, vi, beforeEach } from "vitest";
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
