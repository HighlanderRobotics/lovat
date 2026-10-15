import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testUser } from "./helpers/handlerHarness.js";
const mocks = vi.hoisted(() => ({
  http: vi.fn(),
  last: vi.fn(),
  prediction: vi.fn(),
  alliance: vi.fn(),
  importMatches: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
}));
vi.mock("axios", () => ({ default: { get: mocks.http } }));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    teamMatchData: { findFirstOrThrow: mocks.last },
    cachedAnalysis: { create: mocks.create },
  },
}));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.get, set: mocks.set },
}));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: mocks.importMatches,
}));
vi.mock("../src/handler/analysis/predictions/matchPredictionLogic.js", () => ({
  matchPredictionLogic: mocks.prediction,
}));
vi.mock("../src/handler/analysis/predictions/alliancePage.js", () => ({
  alliancePage: mocks.alliance,
}));
import { qualRankingPredictionLogic } from "../src/handler/analysis/predictions/qualRankingPredictionLogic.js";
const match = (
  number: number,
  winner = "red",
  redScore = 100,
  blueScore = 80,
) => ({
  match_number: number,
  comp_level: "qm",
  predicted_time: number,
  winning_alliance: winner,
  alliances: {
    red: { team_keys: ["frc1", "frc2", "frc3"], score: redScore },
    blue: { team_keys: ["frc4", "frc5", "frc6"], score: blueScore },
  },
  score_breakdown: { red: { rp: 3 }, blue: { rp: 1 } },
});
let matches: ReturnType<typeof match>[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.get.mockResolvedValue(null);
  mocks.last.mockResolvedValue({ matchNumber: 3 });
  mocks.prediction.mockResolvedValue({ winningAlliance: 0 });
  mocks.alliance.mockResolvedValue({ totalPoints: 300 });
  matches = [match(1)];
  mocks.http.mockImplementation(async (url) => ({
    data: url.endsWith("/matches")
      ? matches
      : [1, 2, 3, 4, 5, 6, 7].map((team_number) => ({ team_number })),
  }));
});
afterEach(() => vi.restoreAllMocks());
it("uses played results and skips elimination matches while retaining idle teams", async () => {
  matches = [
    match(3, ""),
    { ...match(4), comp_level: "sf" },
    match(2, "blue", 70, 90),
    match(1),
  ];
  const result = await qualRankingPredictionLogic(testUser, {
    tournamentKey: "2026test",
  });
  expect(result.find((team) => team.teamNumber === 1)).toEqual({
    teamNumber: 1,
    wins: 1,
    losses: 1,
    ties: 1,
    rankingPoints: 9,
    matchesPlayed: 3,
    combinedScore: 270,
    averageScore: 90,
    highScore: 100,
  });
  expect(result.find((team) => team.teamNumber === 4)).toMatchObject({
    wins: 1,
    losses: 1,
    ties: 1,
    rankingPoints: 3,
    matchesPlayed: 3,
    combinedScore: 250,
    averageScore: 83.33,
    highScore: 90,
  });
  expect(result.find((team) => team.teamNumber === 7)).toMatchObject({
    matchesPlayed: 0,
    averageScore: 0,
    rankingPoints: 0,
  });
  expect(mocks.prediction).not.toHaveBeenCalled();
  expect(mocks.importMatches).toHaveBeenCalledWith("2026test");
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringContaining("qualPredictionLogic:2026test"),
  );
});
it("defaults missing played ranking points to zero", async () => {
  matches = [
    {
      ...match(1),
      score_breakdown: undefined as unknown as ReturnType<
        typeof match
      >["score_breakdown"],
    },
  ];
  expect(
    (
      await qualRankingPredictionLogic(testUser, { tournamentKey: "2026test" })
    )[0].rankingPoints,
  ).toBe(0);
});
it.each([
  { red: 200, blue: 200, winner: 0, redRP: 3, blueRP: 0 },
  { red: 240, blue: 400, winner: 1, redRP: 1, blueRP: 5 },
  { red: 400, blue: 240, winner: 0, redRP: 5, blueRP: 1 },
])(
  "predicts remaining qualifications using RP thresholds ($red/$blue)",
  async ({ red, blue, winner, redRP, blueRP }) => {
    matches = [match(4)];
    mocks.prediction.mockResolvedValue({ winningAlliance: winner });
    mocks.alliance.mockImplementation(async (_user, { team1 }) => ({
      totalPoints: team1 === 1 ? red : blue,
    }));
    const result = await qualRankingPredictionLogic(testUser, {
      tournamentKey: "2026test",
    });
    expect(result.find((team) => team.teamNumber === 1)).toMatchObject({
      wins: winner === 0 ? 1 : 0,
      losses: winner === 0 ? 0 : 1,
      rankingPoints: redRP,
      combinedScore: red * 0.9,
      highScore: red * 0.9,
    });
    expect(result.find((team) => team.teamNumber === 4)).toMatchObject({
      wins: winner === 1 ? 1 : 0,
      losses: winner === 1 ? 0 : 1,
      rankingPoints: blueRP,
      combinedScore: blue * 0.9,
      highScore: blue * 0.9,
    });
    expect(mocks.prediction).toHaveBeenCalledWith(testUser, {
      red1: 1,
      red2: 2,
      red3: 3,
      blue1: 4,
      blue2: 5,
      blue3: 6,
    });
  },
);
it.each(["/matches", "/teams/simple"])(
  "reports TBA failure for %s",
  async (endpoint) => {
    mocks.http.mockImplementation(async (url) => {
      if (url.endsWith(endpoint)) throw new Error("offline");
      return { data: [] };
    });
    await expect(
      qualRankingPredictionLogic(testUser, { tournamentKey: "2026test" }),
    ).rejects.toThrow("Failed to fetch match or team data from TBA");
  },
);
it("propagates insufficient-data prediction failures", async () => {
  matches = [match(4)];
  mocks.prediction.mockRejectedValue("not enough data");
  await expect(
    qualRankingPredictionLogic(testUser, { tournamentKey: "2026test" }),
  ).rejects.toBe("not enough data");
});
it("propagates unexpected prediction failures", async () => {
  matches = [match(4)];
  mocks.prediction.mockRejectedValue(new Error("prediction offline"));
  await expect(
    qualRankingPredictionLogic(testUser, { tournamentKey: "2026test" }),
  ).rejects.toThrow("prediction offline");
});
it("orders equal RP teams by average score and leaves full ties stable", async () => {
  matches = [
    {
      ...match(1, "", 100, 120),
      score_breakdown: { red: { rp: 1 }, blue: { rp: 1 } },
    },
  ];
  const result = await qualRankingPredictionLogic(testUser, {
    tournamentKey: "2026test",
  });
  expect(result.map((team) => team.teamNumber)).toEqual([4, 5, 6, 1, 2, 3, 7]);
});
it("breaks equal RP and average scores by high score", async () => {
  matches = [
    {
      ...match(1, "", 100, 120),
      score_breakdown: { red: { rp: 1 }, blue: { rp: 1 } },
    },
    {
      ...match(2, "", 100, 80),
      score_breakdown: { red: { rp: 1 }, blue: { rp: 1 } },
    },
  ];
  const result = await qualRankingPredictionLogic(testUser, {
    tournamentKey: "2026test",
  });
  expect(result.map((team) => team.teamNumber)).toEqual([4, 5, 6, 1, 2, 3, 7]);
});
