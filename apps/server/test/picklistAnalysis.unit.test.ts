import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  team: { findMany: vi.fn().mockResolvedValue([]) },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  teamMatchData: { findFirst: vi.fn(), groupBy: vi.fn() },
  scoutReport: { groupBy: vi.fn() },
  cachedAnalysis: { create: vi.fn() },
  get: vi.fn(),
  set: vi.fn(),
  averages: vi.fn(),
  rank: vi.fn(),
  importMatches: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({ kv: { get: db.get, set: db.set } }));
vi.mock("../src/handler/analysis/coreAnalysis/averageManyFast.js", () => ({
  averageManyFast: db.averages,
}));
vi.mock("../src/handler/analysis/rankFlag.js", () => ({
  computeRankFlag: db.rank,
}));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: db.importMatches,
}));
import { zScoreMany } from "../src/handler/analysis/picklist/zScoreMany.js";
import { picklistShell } from "../src/handler/analysis/picklist/picklistShell.js";
import {
  endgamePicklistTeamFast,
  endgameRuleOfSuccession,
} from "../src/handler/analysis/picklist/endgamePicklistTeamFast.js";
import {
  Metric,
  picklistToMetric,
  defaultEndgamePoints,
} from "../src/handler/analysis/analysisConstants.js";
const run = (query: Record<string, string> = {}) =>
  invoke((req, res) => picklistShell(req, res, vi.fn()), { query });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  db.get.mockResolvedValue(null);
  db.rank.mockResolvedValue({ 254: 1, 971: 2 });
  db.teamMatchData.findFirst.mockResolvedValue({ key: "m1" });
  db.teamMatchData.groupBy.mockResolvedValue([
    { teamNumber: 254 },
    { teamNumber: 971 },
  ]);
  db.averages.mockResolvedValue(
    Object.fromEntries(
      Object.values(Metric)
        .filter((x) => typeof x === "number")
        .map((x) => [x, { 254: 10, 971: 20 }]),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());
it("calculates weighted z-scores and preserves raw category flags and rank", async () => {
  const result = await zScoreMany(
    {
      [Metric.totalPoints]: { 254: 10, 971: 20 },
      [Metric.accuracy]: { 254: 75, 971: 100 },
    },
    [254, 971],
    "2026test",
    { totalPoints: 2 },
    ["accuracy", "rank"],
  );
  expect(result).toEqual([
    {
      team: 254,
      result: -2,
      breakdown: [{ type: "totalPoints", result: -2 }],
      unweighted: [{ type: "totalPoints", result: -1 }],
      flags: [
        { type: "accuracy", result: 75 },
        { type: "rank", result: 1 },
      ],
    },
    {
      team: 971,
      result: 2,
      breakdown: [{ type: "totalPoints", result: 2 }],
      unweighted: [{ type: "totalPoints", result: 1 }],
      flags: [
        { type: "accuracy", result: 100 },
        { type: "rank", result: 2 },
      ],
    },
  ]);
});
it.each([0, 10])("keeps identical populations finite (%s)", async (value) => {
  const result = await zScoreMany(
    { [Metric.totalPoints]: { 254: value, 971: value } },
    [254, 971],
    "2026test",
    { totalPoints: 1 },
    [],
  );
  expect(result.map((team) => team.result)).toEqual([0, 0]);
});
it("skips scores for zero observations", async () => {
  const result = await zScoreMany(
    { [Metric.totalPoints]: { 254: 0, 971: 20 } },
    [254, 971],
    "2026test",
    { totalPoints: 1 },
    [],
  );
  expect(result.map((team) => team.result)).toEqual([0, 1]);
});
it("allows an empty team list without emitting NaN", async () => {
  expect(await zScoreMany({}, [], "2026test", {}, [])).toEqual([]);
});
it("propagates rank lookup errors", async () => {
  db.rank.mockRejectedValue(new Error("offline"));
  await expect(zScoreMany({}, [254], "2026test", {}, ["rank"])).rejects.toThrow(
    "offline",
  );
});
it("returns an empty picklist without a tournament", async () => {
  expect((await run()).body).toEqual({ teams: [] });
  expect(db.averages).not.toHaveBeenCalled();
});
it("reports all-zero weights before loading matches", async () => {
  expect((await run({ tournamentKey: "2026test" })).statusCode).toBe(500);
  expect(db.teamMatchData.findFirst).not.toHaveBeenCalled();
});
it.each([true, false])(
  "imports missing tournament matches and sorts weighted teams (%s)",
  async (exists) => {
    db.teamMatchData.findFirst.mockResolvedValue(exists ? { key: "m1" } : null);
    const result = await run({
      tournamentKey: "2026test",
      totalPoints: "2",
      flags: '["accuracy","rank"]',
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      teams: [
        { team: 971, result: 2 },
        { team: 254, result: -2 },
      ],
    });
    expect(db.importMatches).toHaveBeenCalledTimes(exists ? 0 : 1);
    expect(db.averages).toHaveBeenCalledWith(testUser, {
      teams: [254, 971],
      metrics: [Metric.totalPoints, Metric.accuracy],
    });
  },
);
it("reports tournaments without teams", async () => {
  db.teamMatchData.groupBy.mockResolvedValue([]);
  expect(
    (await run({ tournamentKey: "2026test", totalPoints: "1" })).statusCode,
  ).toBe(500);
  expect(db.averages).not.toHaveBeenCalled();
});
it.each(["invalid", "null", "[]"])(
  "handles empty or malformed flag lists (%s)",
  async (flags) => {
    expect(
      (await run({ tournamentKey: "2026test", totalPoints: "1", flags }))
        .statusCode,
    ).toBe(200);
    expect(db.rank).not.toHaveBeenCalled();
  },
);
it("aggregates every supported weight and ignores legacy stage values", async () => {
  const weights = Object.fromEntries(
    [
      ...Object.keys(picklistToMetric),
      "driverAbility",
      "climbResult",
      "totalFuelFed",
      "estimatedSuccessfulFuelRate",
      "estimatedTotalFuelScored",
    ].map((key) => [key, "1"]),
  );
  expect(
    (await run({ tournamentKey: "2026test", ...weights, stage: "auto" }))
      .statusCode,
  ).toBe(200);
  expect(db.averages).toHaveBeenCalledWith(testUser, {
    teams: [254, 971],
    metrics: [...new Set(Object.values(picklistToMetric))],
  });
});
it("returns the configured prior for no endgame attempts", () => {
  expect(endgameRuleOfSuccession({}, 0)).toBe(defaultEndgamePoints);
});
it("applies the succession formula only to observed attempts", () => {
  expect(
    endgameRuleOfSuccession({ L1: 2, L2: 1, NOT_ATTEMPTED: 100 }, 3),
  ).toBeCloseTo(5 / 7);
});
it.each([true, false])(
  "groups endgame attempts while preserving optional source filters (%s)",
  async (filtered) => {
    db.scoutReport.groupBy.mockResolvedValue([
      { endgameClimb: "NOT_ATTEMPTED", _count: { _all: 100 } },
      { endgameClimb: "L1", _count: { _all: 2 } },
      { endgameClimb: "L2", _count: { _all: 1 } },
    ]);
    expect(
      await endgamePicklistTeamFast(
        254,
        filtered ? { in: [8033] } : undefined,
        filtered ? { in: ["2026test"] } : undefined,
      ),
    ).toBeCloseTo(5 / 7);
    expect(db.scoutReport.groupBy).toHaveBeenCalledWith({
      by: ["endgameClimb"],
      _count: { _all: true },
      where: {
        teamMatchData: {
          teamNumber: 254,
          ...(filtered ? { tournamentKey: { in: ["2026test"] } } : {}),
        },
        ...(filtered ? { scouter: { sourceTeamNumber: { in: [8033] } } } : {}),
      },
    });
  },
);
it("propagates endgame lookup failure", async () => {
  db.scoutReport.groupBy.mockRejectedValue(new Error("offline"));
  await expect(
    endgamePicklistTeamFast(254, undefined, undefined),
  ).rejects.toThrow("offline");
});
