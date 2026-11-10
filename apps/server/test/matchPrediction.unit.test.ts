import type { User } from "@lovat/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  average: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../src/handler/analysis/coreAnalysis/arrayAndAverageTeams.js", () => ({
  arrayAndAverageTeams: mocks.average,
}));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.get, set: mocks.set },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    tournament: { findMany: vi.fn().mockResolvedValue([]) },
    cachedAnalysis: { create: mocks.create },
  },
}));
const { matchPredictionLogic } =
  await import("../src/handler/analysis/predictions/matchPredictionLogic.js");
const user: User = {
  id: "prediction-user",
  username: null,
  email: "test@example.invalid",
  emailVerified: true,
  teamNumber: 8033,
  role: "ANALYST",
  teamSourceRule: { mode: "INCLUDE", items: [8033] },
  tournamentSourceRule: { mode: "EXCLUDE", items: [] },
};
const args = { red1: 1, red2: 2, red3: 3, blue1: 4, blue2: 5, blue3: 6 };
const timeline = (values: number[]) => ({
  timeLine: values.map((dataPoint) => ({ dataPoint })),
});
const observations = (red: number[], blue: number[]) => {
  mocks.average.mockImplementation(
    async (_user, { teams }: { teams: number[] }) =>
      Object.fromEntries(
        teams.map((team) => [team, timeline(team <= 3 ? red : blue)]),
      ),
  );
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(null);
  observations([10, 20], [10, 20]);
});

describe("match win probabilities", () => {
  it("gives equally strong alliances equal chances", async () => {
    expect(await matchPredictionLogic(user, args)).toEqual({
      ...args,
      redWinning: 0.5,
      blueWinning: 0.5,
      winningAlliance: 0,
    });
  });
  it.each([
    [[100, 110], [10, 20], 1, 0, 0],
    [[10, 20], [100, 110], 0, 1, 1],
    [[100, 100], [10, 10], 1, 0, 0],
    [[10, 10], [100, 100], 0, 1, 1],
    [[20, 20], [20, 20], 0.5, 0.5, 0],
  ] as const)(
    "predicts known alliance score distributions (%j vs %j)",
    async (red, blue, redWinning, blueWinning, winningAlliance) => {
      observations([...red], [...blue]);
      expect(await matchPredictionLogic(user, args)).toEqual({
        ...args,
        redWinning,
        blueWinning,
        winningAlliance,
      });
    },
  );
  it("returns complementary probabilities for overlapping score distributions", async () => {
    observations([10, 30], [5, 25]);
    const result = await matchPredictionLogic(user, args);
    expect(result.redWinning).toBeGreaterThan(0.5);
    expect(result.redWinning).toBeLessThan(1);
    expect(result.redWinning + result.blueWinning).toBe(1);
    expect(result.winningAlliance).toBe(0);
  });
  it.each(["red", "blue"])(
    "rejects predictions when a %s robot has only one observation",
    async (alliance) => {
      observations(
        alliance === "red" ? [10] : [10, 20],
        alliance === "blue" ? [10] : [10, 20],
      );
      await expect(matchPredictionLogic(user, args)).rejects.toBe(
        "not enough data",
      );
      expect(mocks.set).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
});
