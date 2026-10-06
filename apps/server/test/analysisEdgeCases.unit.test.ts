import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  team: { findMany: vi.fn().mockResolvedValue([]) },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  teamMatchData: { findMany: vi.fn() },
  scoutReport: { findUniqueOrThrow: vi.fn() },
  cachedAnalysis: { create: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({ kv: { get: db.get, set: db.set } }));
import {
  Metric,
  MetricsBreakdown,
  accuracyToPercentageInterpolated,
} from "../src/handler/analysis/analysisConstants.js";
import {
  averageScoutReport,
  calculateScoutReportMetrics,
} from "../src/handler/analysis/coreAnalysis/averageScoutReport.js";
import {
  averageManyFast,
  avg,
} from "../src/handler/analysis/coreAnalysis/averageManyFast.js";
import { arrayAndAverageTeams } from "../src/handler/analysis/coreAnalysis/arrayAndAverageTeams.js";
import {
  averageAllTeamFast,
  filterToSql,
} from "../src/handler/analysis/coreAnalysis/averageAllTeamFast.js";
import { nonEventMetric } from "../src/handler/analysis/coreAnalysis/nonEventMetric.js";
const report = {
  events: [],
  driverAbility: 3,
  defenseEffectiveness: 0,
  endgameClimb: "NOT_ATTEMPTED" as const,
  autoClimb: "NOT_ATTEMPTED" as const,
  accuracy: null,
};
const rows = () => [
  {
    teamNumber: 254,
    tournamentKey: "2026test",
    tournament: { name: "Test", date: new Date("2026-01-01") },
    key: "m1",
    scoutReports: [report],
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  db.get.mockResolvedValue(null);
  db.teamMatchData.findMany.mockResolvedValue(rows());
  db.scoutReport.findUniqueOrThrow.mockResolvedValue(report);
  db.$queryRawUnsafe.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it.each([
  [null, 0],
  [undefined, 0],
  [NaN, 0],
  [Infinity, 0],
  [-1, 25],
  [6, 95],
  [2.5, 70],
])("converts accuracy %s into a finite percentage %s", (value, expected) => {
  expect(accuracyToPercentageInterpolated(value)).toBe(expected);
});
it("averages empty and populated numeric samples", () => {
  expect(avg([])).toBe(0);
  expect(avg([2, 4])).toBe(3);
});
it("calculates report metrics through the cache wrapper", async () => {
  expect(
    await averageScoutReport(testUser, {
      scoutReportUuid: "report",
      metrics: [Metric.totalPoints],
    }),
  ).toEqual({ [Metric.totalPoints]: 0 });
  expect(db.get).toHaveBeenCalledWith(
    expect.stringContaining("averageScoutReport:report"),
  );
});
it("computes remaining climb times only for the requested phase", () => {
  const result = calculateScoutReportMetrics(
    {
      ...report,
      events: [
        {
          action: "CLIMB",
          position: "NONE",
          points: 0,
          quantity: null,
          time: 20,
        },
        {
          action: "CLIMB",
          position: "NONE",
          points: 0,
          quantity: null,
          time: 150,
        },
      ],
    },
    [
      Metric.autoClimbStartTime,
      Metric.l1StartTime,
      Metric.l2StartTime,
      Metric.l3StartTime,
    ],
  );
  expect(result).toEqual({
    [Metric.autoClimbStartTime]: 133,
    [Metric.l1StartTime]: 3,
    [Metric.l2StartTime]: 3,
    [Metric.l3StartTime]: 3,
  });
});
it("omits climb times when no climb events exist", () => {
  expect(
    calculateScoutReportMetrics(report, [
      Metric.autoClimbStartTime,
      Metric.l1StartTime,
    ]),
  ).toEqual({});
});
it.each(
  Object.values(Metric).filter((v): v is Metric => typeof v === "number"),
)(
  "produces finite empty-event match averages for metric %s",
  async (metric) => {
    const result = await averageManyFast(testUser, {
      teams: [254],
      metrics: [metric],
    });
    expect(Number.isFinite(result[metric][254])).toBe(true);
  },
);
it.each(
  Object.values(Metric).filter((v): v is Metric => typeof v === "number"),
)("produces finite empty-event timelines for metric %s", async (metric) => {
  const result = await arrayAndAverageTeams(testUser, { teams: [254], metric });
  expect(Number.isFinite(result[254].average)).toBe(true);
});
it.each(
  Object.values(Metric).filter((v): v is Metric => typeof v === "number"),
)("defaults empty population samples to zero for metric %s", async (metric) => {
  expect(await averageAllTeamFast(testUser, { metric })).toBe(0);
});
it("supports unrestricted source rules for many-team analysis", async () => {
  await averageManyFast(
    {
      ...testUser,
      teamSourceRule: { mode: "EXCLUDE", items: [] },
      tournamentSourceRule: { mode: "EXCLUDE", items: [] },
    },
    { teams: [254], metrics: [Metric.totalPoints] },
  );
  expect(db.teamMatchData.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { teamNumber: { in: [254] } },
      select: expect.objectContaining({
        scoutReports: expect.objectContaining({ where: {} }),
      }),
    }),
  );
});
it("propagates timeline persistence failures", async () => {
  db.teamMatchData.findMany.mockRejectedValue(new Error("database"));
  await expect(
    arrayAndAverageTeams(testUser, {
      teams: [254],
      metric: Metric.totalPoints,
    }),
  ).rejects.toThrow("database");
});
it("propagates discrete metric SQL errors", async () => {
  db.$queryRawUnsafe.mockRejectedValue(new Error("database"));
  await expect(
    nonEventMetric(testUser, { team: 254, metric: MetricsBreakdown.robotRole }),
  ).rejects.toThrow("database");
});
it("omits climb times when a successful climb has no matching event", async () => {
  db.teamMatchData.findMany.mockResolvedValue([
    {
      ...rows()[0],
      scoutReports: [{ ...report, autoClimb: "SUCCEEDED", endgameClimb: "L1" }],
    },
  ]);
  expect(
    await averageManyFast(testUser, {
      teams: [254],
      metrics: [Metric.autoClimbStartTime, Metric.l1StartTime],
    }),
  ).toEqual({
    [Metric.autoClimbStartTime]: { 254: -1 },
    [Metric.l1StartTime]: { 254: -1 },
  });
});
it("skips matches with no authorized reports in timeline analysis", async () => {
  db.teamMatchData.findMany.mockResolvedValue([
    { ...rows()[0], scoutReports: [] },
  ]);
  expect(
    await arrayAndAverageTeams(testUser, {
      teams: [254],
      metric: Metric.totalPoints,
    }),
  ).toEqual({ 254: { average: 0, timeLine: [] } });
});
it.each([Metric.autoClimbStartTime, Metric.l1StartTime])(
  "uses the earliest repeated climb timestamp for population metric %s",
  async (metric) => {
    const start = metric === Metric.autoClimbStartTime ? 10 : 100;
    db.$queryRawUnsafe.mockResolvedValue([
      { scoutReportUuid: "r", time: start + 5 },
      { scoutReportUuid: "r", time: start },
      { scoutReportUuid: "r", time: start + 10 },
    ]);
    expect(
      await averageAllTeamFast(
        { ...testUser, teamSourceRule: { mode: "EXCLUDE", items: [] } },
        { metric },
      ),
    ).toBe(metric === Metric.autoClimbStartTime ? 13 : 58);
  },
);
it.each([Metric.totalFuelOutputted, Metric.totalBallThroughput])(
  "treats unknown fuel quantities as zero for population metric %s",
  async (metric) => {
    db.$queryRawUnsafe.mockResolvedValue([
      { tournamentKey: "2026test", scoutReportUuid: "r", quantity: null },
    ]);
    expect(await averageAllTeamFast(testUser, { metric })).toBe(0);
  },
);
it("returns zero scoring rate when a report has no completed scoring interval", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    { scoutReportUuid: "r", action: "STOP_SCORING", time: 10, quantity: null },
  ]);
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.fuelPerSecond }),
  ).toBe(0);
});
it.each([null, 100])(
  "defaults unknown accuracy to full scoring accuracy (%s)",
  async (accuracy) => {
    db.$queryRawUnsafe.mockResolvedValue([
      {
        tournamentKey: "2026test",
        matchPoints: 10,
        accuracy,
        autoClimb: "NOT_ATTEMPTED",
        endgameClimb: "NOT_ATTEMPTED",
      },
    ]);
    expect(
      await averageAllTeamFast(testUser, { metric: Metric.totalPoints }),
    ).toBe(10);
  },
);
it("uses event parameters without source restrictions", async () => {
  db.$queryRawUnsafe.mockResolvedValue([{ scoutReportUuid: "r", count: 2n }]);
  expect(
    await averageAllTeamFast(
      { ...testUser, teamSourceRule: { mode: "EXCLUDE", items: [] } },
      { metric: Metric.volleysPerMatch },
    ),
  ).toBe(2);
});
it("reports zero duration for absent defense phases", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    { scoutReportUuid: "r", action: "START_CAMPING", time: 10 },
    { scoutReportUuid: "r", action: "STOP_CAMPING", time: 20 },
  ]);
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.totalDefenseTime }),
  ).toBe(10);
});
it("treats unknown single-report fuel quantities as zero", () => {
  const result = calculateScoutReportMetrics(
    {
      ...report,
      events: [
        {
          action: "STOP_FEEDING",
          time: 10,
          quantity: null,
          points: 0,
          position: "NONE",
        },
      ],
    },
    [Metric.totalBallThroughput],
  );
  expect(result).toEqual({ [Metric.totalBallThroughput]: 0 });
});
it("converts empty scalar filters into unrestricted SQL without consuming parameters", () => {
  expect(filterToSql({}, "int[]", "teamNumber", 2)).toEqual({
    clause: "",
    param: null,
    nextIdx: 2,
  });
});
