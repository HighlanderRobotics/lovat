import { beforeEach, expect, it, vi } from "vitest";
import { testUser, invoke } from "./helpers/handlerHarness.js";
const mocks = vi.hoisted(() => ({
  averages: vi.fn(),
  roles: vi.fn(),
  paths: vi.fn(),
  many: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    tournament: { findMany: vi.fn().mockResolvedValue([]) },
    cachedAnalysis: { create: mocks.create },
  },
}));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.get, set: mocks.set },
}));
vi.mock("../src/handler/analysis/coreAnalysis/arrayAndAverageTeams.js", () => ({
  arrayAndAverageTeams: mocks.averages,
}));
vi.mock("../src/handler/analysis/coreAnalysis/averageManyFast.js", () => ({
  averageManyFast: mocks.many,
}));
vi.mock("../src/handler/analysis/coreAnalysis/robotRole.js", () => ({
  robotRole: mocks.roles,
}));
vi.mock("../src/handler/analysis/autoPaths/autoPathsTeam.js", () => ({
  autoPathsTeam: mocks.paths,
}));
import {
  Metric,
  FlippedRoleMap,
} from "../src/handler/analysis/analysisConstants.js";
import { alliancePage } from "../src/handler/analysis/predictions/alliancePage.js";
import { alliancePageResponse } from "../src/handler/analysis/predictions/alliancePageResponse.js";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(null);
  mocks.averages.mockResolvedValue({
    1: { average: 10 },
    2: { average: 20 },
    3: { average: 30 },
  });
  mocks.roles.mockResolvedValue({ mainRoles: ["SCORING"] });
  mocks.paths.mockResolvedValue([]);
});
it.each([true, false])(
  "aggregates alliance points, throughput and available climb times (%s)",
  async (active) => {
    const metrics = [
      Metric.l1StartTime,
      Metric.l2StartTime,
      Metric.l3StartTime,
      Metric.totalFuelOutputted,
      Metric.totalBallThroughput,
    ];
    mocks.many.mockResolvedValue(
      Object.fromEntries(
        metrics.map((metric) => [
          metric,
          { 1: active ? 1 : 0, 2: active ? 2 : -1, 3: active ? 3 : 0 },
        ]),
      ),
    );
    if (!active) mocks.roles.mockResolvedValue({ mainRoles: [] });
    const result = await alliancePage(testUser, {
      team1: 1,
      team2: 2,
      team3: 3,
    });
    expect(result).toEqual({
      totalPoints: 60,
      teams: [1, 2, 3].map((team) => ({
        team,
        role: FlippedRoleMap[active ? "SCORING" : "IMMOBILE"],
        averagePoints: team * 10,
        paths: [],
      })),
      l1StartTime: active ? [1, 2, 3] : [null, null, null],
      l2StartTime: active ? [1, 2, 3] : [null, null, null],
      l3StartTime: active ? [1, 2, 3] : [null, null, null],
      totalFuelOutputted: active ? 6 : -1,
      totalBallThroughput: active ? 6 : -1,
    });
    expect(mocks.roles).toHaveBeenCalledWith(testUser, { team: 3 });
    expect(mocks.paths).toHaveBeenCalledWith(testUser, { team: 2 });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: expect.stringContaining("alliancePage:1:2:3"),
          teamDependencies: [1, 2, 3],
        }),
      }),
    );
  },
);
it("parses query team numbers and delegates the alliance response", async () => {
  mocks.many.mockResolvedValue(
    Object.fromEntries(
      [
        Metric.l1StartTime,
        Metric.l2StartTime,
        Metric.l3StartTime,
        Metric.totalFuelOutputted,
        Metric.totalBallThroughput,
      ].map((metric) => [metric, { 1: 1, 2: 2, 3: 3 }]),
    ),
  );
  const response = await invoke(
    (req, res) => alliancePageResponse(req, res, vi.fn()),
    { query: { teamOne: "3", teamTwo: "1", teamThree: "2" } },
  );
  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({ totalPoints: 60 });
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringContaining("alliancePageResponse:1:2:3"),
  );
});
