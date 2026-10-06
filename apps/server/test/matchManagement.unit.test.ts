import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  team: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  teamMatchData: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  scouterScheduleShift: { findMany: vi.fn() },
  importMatches: vi.fn(),
  average: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: db.importMatches,
}));
vi.mock("../src/handler/analysis/coreAnalysis/averageScoutReport.js", () => ({
  computeAverageScoutReport: db.average,
}));
import { Metric } from "../src/handler/analysis/analysisConstants.js";
import { getMatches } from "../src/handler/manager/getMatches.js";
import {
  getMatchResults,
  ALLIANCE_METRICS,
} from "../src/handler/manager/getMatchResults.js";
import { getTeamTournamentStatus } from "../src/handler/manager/getTeamTournamentStatus.js";
const rows = (matchNumber: number, matchType = "QUALIFICATION", base = 100) =>
  Array.from({ length: 6 }, (_, slot) => ({
    matchNumber,
    matchType,
    teamNumber: base + slot + 1,
    key: `m-${matchType}-${matchNumber}_${slot}`,
    _count: { scoutReports: slot === 0 ? 2 : 0 },
    scoutReports:
      slot === 0 ? [{ scouter: { name: "Completed", uuid: "complete" } }] : [],
  }));
const shift = (start: number, end: number) => ({
  startMatchOrdinalNumber: start,
  endMatchOrdinalNumber: end,
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((slot) => [
      `team${slot}`,
      slot === 1
        ? [
            { uuid: "complete", name: "Completed" },
            { uuid: "missing", name: "Scheduled" },
          ]
        : [],
    ]),
  ),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", db.fetch);
  db.teamMatchData.findFirst.mockResolvedValue({ matchNumber: 1 });
  db.teamMatchData.findMany.mockResolvedValue([
    ...rows(1),
    ...rows(2, "QUALIFICATION", 200),
    ...rows(1, "ELIMINATION", 300),
  ]);
  db.scouterScheduleShift.findMany.mockResolvedValue([
    shift(1, 1),
    shift(2, 3),
  ]);
  db.team.findUnique.mockResolvedValue({ number: 254, name: "Test team" });
  db.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      frc254: {
        qual: { ranking: { rank: 2, matches_played: 3, sort_orders: [1.5] } },
      },
    }),
  });
  db.average.mockResolvedValue(
    Object.fromEntries(ALLIANCE_METRICS.map((metric) => [metric, 10])),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("formats ordered quals and elims with completed and scheduled own-team reports", async () => {
  const result = await invoke(getMatches, {
    params: { tournament: "2026test" },
  });
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject([
    {
      matchNumber: 1,
      matchType: 0,
      scouted: true,
      finished: true,
      team1: {
        number: 101,
        scouters: [
          { name: "Completed", scouted: true },
          { name: "Scheduled", scouted: false },
        ],
        externalReports: 1,
      },
    },
    { matchNumber: 2, matchType: 0, finished: false },
    { matchNumber: 1, matchType: 1, finished: false },
  ]);
  expect(db.importMatches).toHaveBeenCalledWith("2026test");
  expect(db.scouterScheduleShift.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { sourceTeamNumber: 8033, tournamentKey: "2026test" },
    }),
  );
});
it("does not reveal scouter names to teamless viewers", async () => {
  const result = await invoke(getMatches, {
    params: { tournament: "2026test" },
    user: { ...testUser, teamNumber: null },
  });
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject(
    Array.from({ length: 3 }, () => ({
      team1: { scouters: [], externalReports: 2 },
    })),
  );
  expect(db.scouterScheduleShift.findMany).not.toHaveBeenCalled();
});
it.each([
  { mode: "INCLUDE", items: [971] },
  { mode: "INCLUDE", items: [8033] },
  { mode: "EXCLUDE", items: [8033, 971] },
])(
  "includes own-team reports without altering stored source rules (%j)",
  async (teamSourceRule) => {
    const original = structuredClone(teamSourceRule);
    await invoke(getMatches, {
      params: { tournament: "2026test" },
      user: { ...testUser, teamSourceRule },
    });
    const filter =
      teamSourceRule.mode === "INCLUDE"
        ? { in: teamSourceRule.items.includes(8033) ? [8033] : [971, 8033] }
        : { notIn: [971] };
    expect(db.teamMatchData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              scoutReports: {
                where: { scouter: { sourceTeamNumber: filter } },
              },
            },
          },
        }),
      }),
    );
    expect(teamSourceRule).toEqual(original);
  },
);
it.each(["[]", "[201]", "[301]", "[999]"])(
  "filters and condenses matches by required teams (%s)",
  async (teams) => {
    const result = await invoke(getMatches, {
      params: { tournament: "2026test" },
      query: { teams },
    });
    expect(result.statusCode).toBe(200);
    expect((result.body as unknown[]).length).toBe(
      teams === "[]" ? 3 : teams === "[999]" ? 0 : 1,
    );
  },
);
it("allows an empty tournament and no scheduled shifts", async () => {
  db.teamMatchData.findFirst.mockResolvedValue(null);
  db.teamMatchData.findMany.mockResolvedValue([]);
  db.scouterScheduleShift.findMany.mockResolvedValue([]);
  expect(
    (await invoke(getMatches, { params: { tournament: "2026test" } })).body,
  ).toEqual([]);
});
it("marks unscouted matches and defaults completion when there are no reports", async () => {
  db.teamMatchData.findFirst.mockResolvedValue(null);
  db.teamMatchData.findMany.mockResolvedValue(
    rows(1).map((row) => ({
      ...row,
      _count: { scoutReports: 0 },
      scoutReports: [],
    })),
  );
  db.scouterScheduleShift.findMany.mockResolvedValue([shift(2, 3)]);
  expect(
    (await invoke(getMatches, { params: { tournament: "2026test" } })).body,
  ).toMatchObject([
    {
      scouted: false,
      finished: false,
      team1: { scouters: [], externalReports: 0 },
    },
  ]);
});
it.each([undefined, '["bad"]', "[1,2,3,4,5,6,7]"])(
  "rejects invalid match filters or missing tournament (%s)",
  async (teams) => {
    expect(
      (
        await invoke(getMatches, {
          params: teams ? { tournament: "2026test" } : {},
          query: teams ? { teams } : {},
        })
      ).statusCode,
    ).toBe(400);
    expect(db.importMatches).not.toHaveBeenCalled();
  },
);
it("reports malformed JSON and import failures", async () => {
  expect(
    (
      await invoke(getMatches, {
        params: { tournament: "2026test" },
        query: { teams: "invalid" },
      })
    ).statusCode,
  ).toBe(500);
  db.importMatches.mockRejectedValue(new Error("offline"));
  expect(
    (await invoke(getMatches, { params: { tournament: "2026test" } }))
      .statusCode,
  ).toBe(500);
});
it("averages report observations per team before summing alliance totals", async () => {
  db.teamMatchData.findUnique.mockImplementation(async ({ where }) => ({
    teamNumber: Number(where.key.at(-1)) + 1,
    scoutReports: [
      {
        uuid: "r1",
        robotRoles: ["SCORING", "FEEDING", "DEFENDING", "IMMOBILE", "CYCLING"],
      },
      { uuid: "r2", robotRoles: [] },
    ],
  }));
  const result = await invoke(getMatchResults, { query: { matchKey: "m1" } });
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    red: {
      totalPoints: 30,
      totalDefenseTime: 30,
      totalFuelOutputted: 30,
      autoPoints: 30,
      teleopPoints: 30,
      teams: [1, 2, 3].map((teamNumber) => ({
        teamNumber,
        pointsScored: 10,
        role: [1, 1, 1, 1, 1, 0],
      })),
    },
    blue: { totalPoints: 30 },
  });
  expect(db.teamMatchData.findUnique).toHaveBeenCalledTimes(6);
  expect(db.average).toHaveBeenCalledWith("r1", [Metric.totalPoints]);
});
it("keeps match results finite for teams with no reports", async () => {
  db.teamMatchData.findUnique.mockResolvedValue({
    teamNumber: 254,
    scoutReports: [],
  });
  const result = await invoke(getMatchResults, { query: { matchKey: "m1" } });
  expect(result.body).toMatchObject({
    red: {
      totalPoints: 0,
      teams: Array.from({ length: 3 }, () => ({ pointsScored: 0 })),
    },
  });
});
it("handles missing role arrays in a report", async () => {
  db.teamMatchData.findUnique.mockResolvedValue({
    teamNumber: 254,
    scoutReports: [{ uuid: "r1", robotRoles: null }],
  });
  expect(
    (await invoke(getMatchResults, { query: { matchKey: "m1" } })).statusCode,
  ).toBe(200);
});
it("reports invalid match result requests", async () => {
  expect((await invoke(getMatchResults)).statusCode).toBe(400);
});
it("returns TBA rank and played RP totals alongside database match counts", async () => {
  const result = await invoke(getTeamTournamentStatus, {
    query: { tournamentKey: "2026test", teamNumber: "254" },
  });
  expect(result.body).toEqual({
    number: 254,
    name: "Test team",
    rank: 2,
    rankingPoints: 5,
    matchesPlayed: 3,
    matchesTotal: 18,
  });
  expect(db.teamMatchData.findMany).toHaveBeenCalledWith({
    where: {
      tournamentKey: "2026test",
      teamNumber: 254,
      matchType: "QUALIFICATION",
    },
    select: { teamNumber: true },
  });
});
it("reports failed TBA status requests", async () => {
  db.fetch.mockResolvedValue({ ok: false });
  expect(
    (
      await invoke(getTeamTournamentStatus, {
        query: { tournamentKey: "2026test", teamNumber: "254" },
      })
    ).statusCode,
  ).toBe(500);
});
it("reports malformed team status input", async () => {
  expect((await invoke(getTeamTournamentStatus)).statusCode).toBe(400);
});

it("applies report visibility rules to match-result reads", async () => {
  db.teamMatchData.findUnique.mockResolvedValue({
    teamNumber: 254,
    scoutReports: [],
  });
  await invoke(getMatchResults, { query: { matchKey: "m1" } });
  expect(db.teamMatchData.findUnique).toHaveBeenCalledWith({
    where: { key: "m1_0" },
    include: {
      scoutReports: {
        where: {
          scouter: { sourceTeamNumber: { in: [8033] } },
          teamMatchData: { tournamentKey: undefined },
        },
      },
    },
  });
});
it("returns missing matches without attempting report averages", async () => {
  db.teamMatchData.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(getMatchResults, { query: { matchKey: "m1" } })).statusCode,
  ).toBe(404);
  expect(db.average).not.toHaveBeenCalled();
});
it("reports unavailable match-result storage", async () => {
  db.teamMatchData.findUnique.mockRejectedValue(new Error("offline"));
  expect(
    (await invoke(getMatchResults, { query: { matchKey: "m1" } })).statusCode,
  ).toBe(500);
});
it("reports a team absent from an event", async () => {
  db.teamMatchData.findMany.mockResolvedValue([]);
  expect(
    (
      await invoke(getTeamTournamentStatus, {
        query: { tournamentKey: "2026test", teamNumber: "254" },
      })
    ).statusCode,
  ).toBe(404);
  expect(db.fetch).not.toHaveBeenCalled();
});
it("reports unknown team metadata", async () => {
  db.team.findUnique.mockResolvedValue(null);
  expect(
    (
      await invoke(getTeamTournamentStatus, {
        query: { tournamentKey: "2026test", teamNumber: "254" },
      })
    ).statusCode,
  ).toBe(404);
  expect(db.fetch).not.toHaveBeenCalled();
});
it("rejects nonnumeric team status input", async () => {
  expect(
    (
      await invoke(getTeamTournamentStatus, {
        query: { tournamentKey: "2026test", teamNumber: "invalid" },
      })
    ).statusCode,
  ).toBe(400);
  expect(db.teamMatchData.findMany).not.toHaveBeenCalled();
});
