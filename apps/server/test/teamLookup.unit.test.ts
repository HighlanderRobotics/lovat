import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RequestHandler } from "express";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  team: { findUnique: vi.fn() },
  scoutReport: { count: vi.fn(), findMany: vi.fn() },
  cachedAnalysis: { create: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  averages: vi.fn(),
  population: vi.fn(),
  breakdown: vi.fn(),
  paths: vi.fn(),
  rank: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({ kv: { get: db.get, set: db.set } }));
vi.mock("../src/handler/analysis/analysisConstants.js", () => ({
  Metric: { autoPoints: 1 },
  metricsToNumber: { autoPoints: 1, feedingRate: 2 },
  metricsCategory: [1, 2],
  metricToName: { 1: "autoPoints", 2: "feedingRate" },
  MetricsBreakdown: { roles: "robotRoles", climb: "endgameClimb" },
  allTeamNumbers: Promise.resolve([8033, 254]),
  allTournaments: Promise.resolve(["2026test"]),
  dashboardToServer: {
    roles: "robotRoles",
    feeders: "feederTypes",
    moving: "scoresWhileMoving",
    climb: "endgameClimb",
  },
  breakdownPos: "TRUE",
  breakdownNeg: "FALSE",
}));
vi.mock("../src/handler/analysis/coreAnalysis/arrayAndAverageTeams.js", () => ({
  arrayAndAverageTeams: db.averages,
}));
vi.mock("../src/handler/analysis/coreAnalysis/averageAllTeamFast.js", () => ({
  averageAllTeamFast: db.population,
}));
vi.mock("../src/handler/analysis/coreAnalysis/nonEventMetric.js", () => ({
  nonEventMetric: db.breakdown,
}));
vi.mock("../src/handler/analysis/autoPaths/autoPathsTeam.js", () => ({
  autoPathsTeam: db.paths,
}));
vi.mock("../src/handler/analysis/rankFlag.js", () => ({ rankFlag: db.rank }));
import { categoryMetrics } from "../src/handler/analysis/teamLookUp/categoryMetrics.js";
import { breakdownMetrics } from "../src/handler/analysis/teamLookUp/breakdownMetrics.js";
import { breakdownDetails } from "../src/handler/analysis/teamLookUp/breakdownDetails.js";
import { detailsPage } from "../src/handler/analysis/teamLookUp/detailsPage.js";
import { getNotes } from "../src/handler/analysis/teamLookUp/getNotes.js";
import { multipleFlags } from "../src/handler/analysis/teamLookUp/multipleFlags.js";
const run = (
  handler: RequestHandler,
  overrides: Parameters<typeof invoke>[1] = {},
) =>
  invoke((req, res) => handler(req, res, vi.fn()), {
    params: { team: "254" },
    ...overrides,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.get.mockResolvedValue(null);
  db.team.findUnique.mockResolvedValue({ number: 254 });
  db.scoutReport.count.mockResolvedValue(1);
  db.scoutReport.findMany.mockResolvedValue([]);
  db.averages.mockImplementation(async (_user, { metric }) => ({
    254: {
      average: metric * 10,
      timeLine: [{ match: "m1", dataPoint: metric * 10 }],
    },
  }));
  db.population.mockResolvedValue(15);
  db.paths.mockResolvedValue([{ path: "auto" }]);
  db.rank.mockResolvedValue({ 254: 3 });
});
afterEach(() => vi.restoreAllMocks());
for (const handler of [categoryMetrics, breakdownMetrics, getNotes]) {
  it("reports an unknown team before reading reports", async () => {
    db.team.findUnique.mockResolvedValue(null);
    expect((await run(handler)).body).toBe("TEAM_DOES_NOT_EXIST");
    expect(db.scoutReport.count).not.toHaveBeenCalled();
  });
  it("reports a team with no scouting data", async () => {
    db.scoutReport.count.mockResolvedValue(0);
    expect((await run(handler)).body).toBe("NO_DATA_FOR_TEAM");
  });
}
it("maps every category to its named average", async () => {
  expect((await run(categoryMetrics)).body).toEqual({
    autoPoints: 10,
    feedingRate: 20,
  });
  expect(db.averages).toHaveBeenCalledTimes(2);
  expect(db.averages).toHaveBeenCalledWith(testUser, {
    teams: [254],
    metric: 2,
  });
  expect(db.get).toHaveBeenCalledWith(
    expect.stringContaining("categoryMetrics:254"),
  );
});
it("includes observed breakdowns and omits all-zero categories", async () => {
  db.breakdown
    .mockResolvedValueOnce({ SCORING: 100, FEEDING: 0 })
    .mockResolvedValueOnce({ NONE: 0 });
  expect((await run(breakdownMetrics)).body).toEqual({
    roles: { SCORING: 100, FEEDING: 0 },
  });
  expect(db.breakdown).toHaveBeenCalledWith(testUser, {
    team: 254,
    metric: "robotRoles",
  });
  expect(db.get).toHaveBeenCalledWith(
    expect.stringContaining("breakdownMetrics:254"),
  );
});
it("returns autonomous paths for auto points", async () => {
  expect(
    (await run(detailsPage, { params: { team: "254", metric: "autoPoints" } }))
      .body,
  ).toEqual({ paths: [{ path: "auto" }] });
  expect(db.population).not.toHaveBeenCalled();
});
it("compares a team's metric with the visible population", async () => {
  expect(
    (await run(detailsPage, { params: { team: "254", metric: "feedingRate" } }))
      .body,
  ).toEqual({
    array: [{ match: "m1", dataPoint: 20 }],
    result: 20,
    all: 15,
    difference: 5,
    team: 254,
  });
  expect(db.population).toHaveBeenCalledWith(testUser, { metric: 2 });
  expect(db.get).toHaveBeenCalledWith(
    expect.stringContaining("detailsPage:254:feedingRate"),
  );
});
const note = (source: number) => ({
  notes: "Strategy",
  robotBrokeDescription: "Broken wheel",
  teamMatchKey: "m1",
  teamMatchData: { tournament: { name: "Test event" } },
  scouter: { sourceTeamNumber: source, name: "Private name" },
});
it("shows scouter names only for notes from the viewer's own team", async () => {
  db.scoutReport.findMany.mockResolvedValue([note(8033), note(971)]);
  const result = await run(getNotes);
  expect(result.body).toEqual(
    [8033, 971].map((source) => ({
      notes: "Strategy",
      robotBrokeDescription: "Broken wheel",
      match: "m1",
      tournamentName: "Test event",
      sourceTeam: source,
      scouterName: source === 8033 ? "Private name" : undefined,
    })),
  );
  expect(db.scoutReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        teamMatchData: { teamNumber: 254, tournamentKey: undefined },
        scouter: { sourceTeamNumber: { in: [8033] } },
        notes: { not: "" },
      },
    }),
  );
});
it("omits private names for teamless note viewers", async () => {
  db.scoutReport.findMany.mockResolvedValue([note(8033)]);
  const result = await run(getNotes, {
    user: { ...testUser, teamNumber: null },
  });
  expect(result.body).toEqual([
    {
      notes: "Strategy",
      robotBrokeDescription: "Broken wheel",
      match: "m1",
      tournamentName: "Test event",
      sourceTeam: 8033,
    },
  ]);
  expect(db.scoutReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({
        scouter: { select: { sourceTeamNumber: true, name: false } },
      }),
    }),
  );
});
it.each([
  { breakdown: "roles", input: null, expected: [] },
  {
    breakdown: "roles",
    input: ["SCORING", "FEEDING"],
    expected: ["SCORING", "FEEDING"],
  },
  {
    breakdown: "feeders",
    input: '{"CONTINUOUS",BURST}',
    expected: ["CONTINUOUS", "BURST"],
  },
  { breakdown: "roles", input: "{}", expected: [] },
  { breakdown: "roles", input: "  SCORING  ", expected: ["SCORING"] },
  { breakdown: "roles", input: "   ", expected: [] },
  { breakdown: "roles", input: "{unfinished", expected: ["{unfinished"] },
  { breakdown: "moving", input: true, expected: ["TRUE"] },
  { breakdown: "moving", input: false, expected: ["FALSE"] },
  { breakdown: "climb", input: "L2", expected: ["L2"] },
])(
  "formats breakdown detail values ($input)",
  async ({ breakdown, input, expected }) => {
    db.$queryRawUnsafe.mockResolvedValue([
      {
        breakdown: input,
        key: "m1",
        tournament: "Test",
        sourceteam: "8033",
        scouter: null,
      },
    ]);
    expect(
      (await run(breakdownDetails, { params: { team: "254", breakdown } }))
        .body,
    ).toEqual(
      expected.map((value) => ({
        key: "m1",
        tournamentName: "Test",
        breakdown: value,
        sourceTeam: "8033",
        scouter: undefined,
      })),
    );
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('sc."sourceTeamNumber" = ANY($1)'),
      [8033],
      ["2026test"],
    );
    expect(db.get).toHaveBeenCalledWith(
      expect.stringContaining(`breakdownDetails:254:${breakdown}`),
    );
  },
);
it("preserves own-team scouter names in breakdown details", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    {
      breakdown: true,
      key: "m1",
      tournament: "Test",
      sourceteam: "8033",
      scouter: "Scout",
    },
  ]);
  expect(
    (
      await run(breakdownDetails, {
        params: { team: "254", breakdown: "moving" },
      })
    ).body,
  ).toEqual([
    {
      key: "m1",
      tournamentName: "Test",
      breakdown: "TRUE",
      sourceTeam: "8033",
      scouter: "Scout",
    },
  ]);
});
it.each(["invalid", "null", "[]"])(
  "treats missing or malformed flags as an empty list (%s)",
  async (flags) => {
    expect((await run(multipleFlags, { query: { flags } })).body).toEqual([]);
  },
);
it("returns requested ranks and category metrics in order", async () => {
  expect(
    (
      await run(multipleFlags, {
        query: {
          flags: '["rank","feedingRate","autoPoints"]',
          tournamentKey: "2026test",
        },
      })
    ).body,
  ).toEqual([3, 20, 10]);
  expect(db.rank).toHaveBeenCalledWith(testUser, {
    eventKey: "2026test",
    teams: [254],
  });
});
it("uses zero rank without a tournament and signals unknown metric flags", async () => {
  expect(
    (await run(multipleFlags, { query: { flags: '["rank","unknown"]' } })).body,
  ).toEqual([0, NaN]);
  expect(db.rank).not.toHaveBeenCalled();
});
