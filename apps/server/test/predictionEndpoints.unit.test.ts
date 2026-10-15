import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const mocks = vi.hoisted(() => ({
  prediction: vi.fn(),
  alliance: vi.fn(),
  qualification: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({
  default: { cachedAnalysis: { create: mocks.create } },
}));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.get, set: mocks.set },
}));
vi.mock("../src/handler/analysis/predictions/matchPredictionLogic.js", () => ({
  matchPredictionLogic: mocks.prediction,
}));
vi.mock("../src/handler/analysis/predictions/alliancePage.js", () => ({
  alliancePage: mocks.alliance,
}));
vi.mock(
  "../src/handler/analysis/predictions/qualRankingPredictionLogic.js",
  () => ({ qualRankingPredictionLogic: mocks.qualification }),
);
import { matchPrediction } from "../src/handler/analysis/predictions/matchPrediction.js";
import { qualRankingPrediction } from "../src/handler/analysis/predictions/qualRankingPrediction.js";
const teams = {
  red1: "1",
  red2: "2",
  red3: "3",
  blue1: "4",
  blue2: "5",
  blue3: "6",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(null);
  mocks.prediction.mockResolvedValue({
    redWinning: 0.75,
    blueWinning: 0.25,
    winningAlliance: 0,
  });
  mocks.alliance.mockImplementation(async (_user, { team1 }) => ({
    totalPoints: team1 * 10,
  }));
  mocks.qualification.mockResolvedValue([
    { teamNumber: 254, rankingPoints: 10 },
  ]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it("returns labeled alliances and their prediction probabilities", async () => {
  const result = await invoke(
    (req, res) => matchPrediction(req, res, vi.fn()),
    { query: teams },
  );
  expect(result.body).toEqual({
    red1: 1,
    red2: 2,
    red3: 3,
    blue1: 4,
    blue2: 5,
    blue3: 6,
    redWinning: 0.75,
    blueWinning: 0.25,
    winningAlliance: 0,
    redAlliance: { totalPoints: 10 },
    blueAlliance: { totalPoints: 40 },
  });
  expect(mocks.prediction).toHaveBeenCalledWith(testUser, {
    red1: 1,
    red2: 2,
    red3: 3,
    blue1: 4,
    blue2: 5,
    blue3: 6,
  });
});
it("uses distinct cache entries when red and blue alliances switch", async () => {
  await invoke((req, res) => matchPrediction(req, res, vi.fn()), {
    query: teams,
  });
  await invoke((req, res) => matchPrediction(req, res, vi.fn()), {
    query: {
      red1: "4",
      red2: "5",
      red3: "6",
      blue1: "1",
      blue2: "2",
      blue3: "3",
    },
  });
  expect(mocks.get.mock.calls[0][0]).not.toBe(mocks.get.mock.calls[1][0]);
});
it.each(["red1", "red2", "red3", "blue1", "blue2", "blue3"])(
  "rejects missing %s before calculation",
  async (field) => {
    expect(
      (
        await invoke((req, res) => matchPrediction(req, res, vi.fn()), {
          query: { ...teams, [field]: "" },
        })
      ).statusCode,
    ).toBe(400);
    expect(mocks.prediction).not.toHaveBeenCalled();
  },
);
it.each(["not enough data", new Error("offline")])(
  "reports match prediction failures (%s)",
  async (error) => {
    mocks.prediction.mockRejectedValue(error);
    const result = await invoke(
      (req, res) => matchPrediction(req, res, vi.fn()),
      { query: teams },
    );
    expect(result.statusCode).toBe(error === "not enough data" ? 200 : 500);
    expect(mocks.alliance).not.toHaveBeenCalled();
  },
);
it("returns qualification rankings with their tournament", async () => {
  const result = await invoke(
    (req, res) => qualRankingPrediction(req, res, vi.fn()),
    { query: { tournamentKey: "2026test" } },
  );
  expect(result.body).toEqual({
    tournamentKey: "2026test",
    rankings: [{ teamNumber: 254, rankingPoints: 10 }],
  });
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringContaining("qualRankingPrediction:2026test"),
  );
});
it.each([
  new Error("Failed to fetch match or team data from TBA"),
  "not enough data",
  new Error("offline"),
  null,
])("reports qualification prediction failures (%s)", async (error) => {
  mocks.qualification.mockRejectedValue(error);
  const result = await invoke(
    (req, res) => qualRankingPrediction(req, res, vi.fn()),
    { query: { tournamentKey: "2026test" } },
  );
  expect(result.statusCode).toBe(
    error === "not enough data" ||
      (error instanceof Error &&
        error.message === "Failed to fetch match or team data from TBA")
      ? 200
      : 500,
  );
});
