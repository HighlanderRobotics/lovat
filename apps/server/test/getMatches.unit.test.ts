import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test";
});

vi.mock("../src/prismaClient.js", () => ({
  default: {
    teamMatchData: { findFirst: vi.fn(), findMany: vi.fn() },
    scouterScheduleShift: { findMany: vi.fn() },
  },
}));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: vi.fn(),
}));

import prismaClient from "../src/prismaClient.js";
import { getMatches } from "../src/handler/manager/getMatches.js";
import { addTournamentMatches } from "../src/handler/manager/addTournamentMatches.js";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";

const tournament = "2026fixture";
const officialRows = (matchType: "QUALIFICATION" | "ELIMINATION") =>
  Array.from({ length: 6 }, (_, slot) => ({
    key: `${tournament}_${matchType === "QUALIFICATION" ? "qm" : "em"}1_${slot}`,
    matchNumber: 1,
    matchType,
    teamNumber: 1000 + slot,
    _count: { scoutReports: 0 },
    scoutReports: [],
  }));
const practiceRow = (teamNumber: number) => ({
  key: `${tournament}_pm1_${teamNumber}`,
  matchNumber: 1,
  matchType: "PRACTICE" as const,
  teamNumber,
  _count: { scoutReports: 2 },
  scoutReports: [{ scouter: { name: "Own scouter", uuid: "own" } }],
});

function appFor(teamNumber: number | null = 8033) {
  const app = express();
  app.get("/matches/:tournament", (req, res) => {
    const authenticated: AuthenticatedRequest = Object.assign(req, {
      user: {
        id: "viewer",
        role: "ANALYST" as const,
        username: "Viewer",
        email: "viewer@example.invalid",
        emailVerified: true,
        teamNumber,
        teamSourceRule: { mode: "INCLUDE", items: [9143] },
        tournamentSourceRule: { mode: "INCLUDE", items: [tournament] },
      },
    });
    void getMatches(authenticated, res);
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prismaClient.teamMatchData.findFirst).mockResolvedValue({
    matchNumber: 1,
  } as never);
  vi.mocked(prismaClient.teamMatchData.findMany).mockResolvedValue([
    ...officialRows("QUALIFICATION"),
    ...officialRows("ELIMINATION"),
    practiceRow(9133),
    practiceRow(8033),
  ] as never);
  vi.mocked(prismaClient.scouterScheduleShift.findMany).mockResolvedValue([
    {
      startMatchOrdinalNumber: 1,
      endMatchOrdinalNumber: 1,
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [
          `team${i + 1}`,
          [{ name: "Assigned scouter", uuid: "assigned" }],
        ]),
      ),
    },
  ] as never);
});

describe("Practice match listing", () => {
  it.each([undefined, "false"])(
    "excludes practice when includePractice is %s",
    async (includePractice) => {
      const query = includePractice ? { includePractice } : {};
      const response = await request(appFor())
        .get(`/matches/${tournament}`)
        .query(query);
      expect(response.status).toBe(200);
      expect(
        response.body.map((match: { matchType: number }) => match.matchType),
      ).toEqual([0, 1]);
      expect(prismaClient.teamMatchData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentKey: tournament, matchType: { not: "PRACTICE" } },
        }),
      );
    },
  );

  it("includes partial practice groups without colliding with official matches or assigning shifts", async () => {
    const response = await request(appFor())
      .get(`/matches/${tournament}`)
      .query({ includePractice: "true" });
    expect(response.status).toBe(200);
    expect(
      response.body.map((match: { matchType: number }) => match.matchType),
    ).toEqual([0, 1, 2]);
    expect(response.body[0].team1).toEqual({
      number: 1000,
      scouters: [{ name: "Assigned scouter", scouted: false }],
      externalReports: 0,
    });
    expect(response.body[1].team1.scouters).toEqual([]);
    expect(response.body[2]).toEqual({
      matchNumber: 1,
      matchType: 2,
      scouted: true,
      finished: false,
      teams: [8033, 9133].map((number) => ({
        number,
        scouters: [{ name: "Own scouter", scouted: true }],
        externalReports: 1,
      })),
    });
    const options = vi.mocked(prismaClient.teamMatchData.findMany).mock
      .calls[0][0];
    expect(options?.select?.scoutReports).toEqual({
      where: { scouter: { sourceTeamNumber: 8033 } },
      select: { scouter: { select: { name: true, uuid: true } } },
    });
    expect(options?.select?._count).toEqual({
      select: {
        scoutReports: {
          where: { scouter: { sourceTeamNumber: { in: [9143, 8033] } } },
        },
      },
    });
  });

  it("applies the all-teams filter to practice groups", async () => {
    const response = await request(appFor())
      .get(`/matches/${tournament}`)
      .query({ includePractice: "true", teams: JSON.stringify([8033, 9133]) });
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].matchType).toBe(2);
    const missing = await request(appFor())
      .get(`/matches/${tournament}`)
      .query({ includePractice: "true", teams: JSON.stringify([8033, 9999]) });
    expect(missing.body).toEqual([]);
  });

  it("hides practice teams whose reports are outside the viewer's sources", async () => {
    vi.mocked(prismaClient.teamMatchData.findMany).mockResolvedValue([
      practiceRow(8033),
      { ...practiceRow(9999), _count: { scoutReports: 0 }, scoutReports: [] },
    ] as never);
    const response = await request(appFor())
      .get(`/matches/${tournament}`)
      .query({ includePractice: "true" });
    expect(response.status).toBe(200);
    expect(
      response.body[0].teams.map((team: { number: number }) => team.number),
    ).toEqual([8033]);
  });

  it("includes practice for viewers without a team without exposing named scouters", async () => {
    vi.mocked(prismaClient.teamMatchData.findMany).mockResolvedValue([
      { ...practiceRow(8033), scoutReports: undefined },
    ] as never);
    const response = await request(appFor(null))
      .get(`/matches/${tournament}`)
      .query({ includePractice: "true" });
    expect(response.status).toBe(200);
    expect(response.body[0].teams).toEqual([
      { number: 8033, scouters: [], externalReports: 2 },
    ]);
    expect(prismaClient.scouterScheduleShift.findMany).not.toHaveBeenCalled();
  });

  it.each(["yes", "1", ["true", "false"]])(
    "rejects invalid includePractice values (%s) before importing matches",
    async (includePractice) => {
      const response = await request(appFor())
        .get(`/matches/${tournament}`)
        .query({ includePractice });
      expect(response.status).toBe(400);
      expect(addTournamentMatches).not.toHaveBeenCalled();
      expect(prismaClient.teamMatchData.findMany).not.toHaveBeenCalled();
    },
  );
});
