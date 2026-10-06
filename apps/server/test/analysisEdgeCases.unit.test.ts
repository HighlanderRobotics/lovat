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
const observedEvents = [
  { action: "START_SCORING", time: 10, quantity: null, points: 0 },
  { action: "STOP_SCORING", time: 20, quantity: 10, points: 10 },
  { action: "START_SCORING", time: 30, quantity: null, points: 0 },
  { action: "STOP_SCORING", time: 40, quantity: 20, points: 20 },
  { action: "START_FEEDING", time: 50, quantity: null, points: 0 },
  { action: "STOP_FEEDING", time: 54, quantity: 8, points: 0 },
  { action: "START_DEFENDING", time: 60, quantity: null, points: 0 },
  { action: "STOP_DEFENDING", time: 62, quantity: null, points: 0 },
  { action: "START_CAMPING", time: 70, quantity: null, points: 0 },
  { action: "STOP_CAMPING", time: 73, quantity: null, points: 0 },
  { action: "CLIMB", time: 20, quantity: null, points: 0 },
  { action: "CLIMB", time: 150, quantity: null, points: 0 },
  {
    action: "INTAKE",
    time: 80,
    quantity: null,
    points: 0,
    position: "OUTPOST",
  },
].map((e) => ({ position: "HUB", ...e }));
const observedReport = {
  ...report,
  driverAbility: 4,
  defenseEffectiveness: 3,
  accuracy: 3,
  autoClimb: "SUCCEEDED",
  endgameClimb: "L2",
  events: observedEvents,
};
const expectedMetrics: [Metric, number][] = [
  [Metric.totalPoints, 57.5],
  [Metric.autoPoints, 22.5],
  [Metric.teleopPoints, 15],
  [Metric.fuelPerSecond, 1.5],
  [Metric.accuracy, 75],
  [Metric.volleysPerMatch, 2],
  [Metric.l1StartTime, -1],
  [Metric.l2StartTime, 8],
  [Metric.l3StartTime, -1],
  [Metric.autoClimbStartTime, 3],
  [Metric.driverAbility, 4],
  [Metric.contactDefenseTime, 2],
  [Metric.defenseEffectiveness, 3],
  [Metric.campingDefenseTime, 3],
  [Metric.totalDefenseTime, 5],
  [Metric.timeFeeding, 4],
  [Metric.feedingRate, 2],
  [Metric.feedsPerMatch, 1],
  [Metric.totalFuelOutputted, 38],
  [Metric.totalBallsFed, 8],
  [Metric.totalBallThroughput, 38],
  [Metric.outpostIntakes, 1],
];
const mockObservedMatches = () => {
  db.teamMatchData.findMany.mockImplementation(async (query) => {
    const where = query.select.scoutReports.select.events?.where;
    const selectedEvents = observedEvents.filter(
      (event) =>
        (!where?.action || event.action === where.action) &&
        (!where?.position || event.position === where.position) &&
        (where?.time?.gt === undefined || event.time > where.time.gt) &&
        (where?.time?.lte === undefined || event.time <= where.time.lte),
    );
    return [
      {
        ...rows()[0],
        scoutReports: [{ ...observedReport, events: selectedEvents }],
      },
    ];
  });
};
it.each(expectedMetrics)(
  "calculates observed match metric %s as %s",
  async (metric, expected) => {
    mockObservedMatches();
    expect(
      await averageManyFast(testUser, { teams: [254], metrics: [metric] }),
    ).toEqual({ [metric]: { 254: expected } });
  },
);
it.each(expectedMetrics)(
  "calculates observed timeline metric %s as %s",
  async (metric, expected) => {
    mockObservedMatches();
    const result = await arrayAndAverageTeams(testUser, {
      teams: [254],
      metric,
    });
    expect(result[254]).toEqual({
      average: expected === -1 ? 0 : expected,
      timeLine: [{ match: "m1", tournamentName: "Test", dataPoint: expected }],
    });
  },
);
it.each([
  Metric.totalPoints,
  Metric.autoPoints,
  Metric.teleopPoints,
  Metric.accuracy,
])(
  "handles undefined and unrecognized accuracy in match metric %s",
  async (metric) => {
    for (const accuracy of [undefined, 100]) {
      db.teamMatchData.findMany.mockResolvedValue([
        { ...rows()[0], scoutReports: [{ ...report, accuracy }] },
      ]);
      expect(
        (await arrayAndAverageTeams(testUser, { teams: [254], metric }))[254]
          .average,
      ).toBe(0);
      expect(
        (await averageManyFast(testUser, { teams: [254], metrics: [metric] }))[
          metric
        ][254],
      ).toBe(0);
    }
  },
);
it("leaves matches without visible reports out of batch averages", async () => {
  db.teamMatchData.findMany.mockResolvedValue([
    { ...rows()[0], scoutReports: [] },
  ]);
  expect(
    await averageManyFast(testUser, {
      teams: [254],
      metrics: [Metric.totalPoints],
    }),
  ).toEqual({ [Metric.totalPoints]: { 254: -1 } });
});
it("permits unrestricted timeline tournament selection", async () => {
  await arrayAndAverageTeams(
    { ...testUser, tournamentSourceRule: { mode: "EXCLUDE", items: [] } },
    { teams: [254], metric: Metric.totalPoints },
  );
  expect(db.teamMatchData.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { teamNumber: { in: [254] } },
      select: expect.objectContaining({
        scoutReports: expect.objectContaining({
          where: { scouter: { sourceTeamNumber: { in: [8033] } } },
        }),
      }),
    }),
  );
});
it("weights later tournaments more heavily", async () => {
  const { weightedTourAvgLeft } =
    await import("../src/handler/analysis/coreAnalysis/arrayAndAverageTeams.js");
  expect(weightedTourAvgLeft([10, 20])).toBe(18);
});
it("defaults missing quantities in single-report scoring throughput", () => {
  expect(
    calculateScoutReportMetrics(
      {
        ...report,
        events: [
          {
            action: "STOP_SCORING",
            position: "HUB",
            time: 10,
            points: 0,
            quantity: null,
          },
        ],
      },
      [Metric.totalFuelOutputted],
    ),
  ).toEqual({ [Metric.totalFuelOutputted]: 0 });
});
it.each([
  [MetricsBreakdown.robotRole, "SCORING"],
  [MetricsBreakdown.fieldTraversal, "NONE"],
  [MetricsBreakdown.climbResult, "L2"],
  [MetricsBreakdown.beached, "NEITHER"],
  [MetricsBreakdown.scoresWhileMoving, true],
  [MetricsBreakdown.disrupts, false],
  [MetricsBreakdown.autoClimb, "SUCCEEDED"],
  [MetricsBreakdown.feederType, "CONTINUOUS"],
  [MetricsBreakdown.intakeType, "NEITHER"],
] as const)(
  "calculates observed categorical proportions for %s",
  async (metric, value) => {
    db.$queryRawUnsafe.mockResolvedValue([
      { breakdown: value, percentage: "0.5" },
    ]);
    const result = await nonEventMetric(
      {
        ...testUser,
        tournamentSourceRule: { mode: "EXCLUDE", items: ["hidden"] },
        teamSourceRule: { mode: "EXCLUDE", items: [971] },
      },
      { team: 254, metric },
    );
    expect(
      result[value === true ? "TRUE" : value === false ? "FALSE" : value],
    ).toBe(0.5);
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('tmd."tournamentKey" != ALL($1)'),
      ["hidden"],
      [971],
      254,
    );
  },
);
it("returns zero-filled categorical options when no reports are visible", async () => {
  expect(
    await nonEventMetric(testUser, {
      team: 254,
      metric: MetricsBreakdown.scoresWhileMoving,
    }),
  ).toEqual({ TRUE: 0, FALSE: 0 });
});
it("maps exclusion filters to SQL with correctly numbered parameters", () => {
  expect(filterToSql({ notIn: [971] }, "int[]", "teamNumber", 2)).toEqual({
    clause: "AND teamNumber != ALL($2::int[])",
    param: [971],
    nextIdx: 3,
  });
});
it("weights tournament driver ratings by recency", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    { tournamentKey: "old", driverAbility: 2 },
    { tournamentKey: "new", driverAbility: 4 },
  ]);
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.driverAbility }),
  ).toBe(3.6);
});
it("averages population accuracy percentages", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    { tournamentKey: "event", accuracy: 2 },
    { tournamentKey: "event", accuracy: 3 },
  ]);
  expect(await averageAllTeamFast(testUser, { metric: Metric.accuracy })).toBe(
    70,
  );
});
it("averages outpost intakes per report", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    { scoutReportUuid: "a", count: 2n },
    { scoutReportUuid: "b", count: 4n },
  ]);
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.outpostIntakes }),
  ).toBe(3);
});
it.each([
  [Metric.totalPoints, 42.5],
  [Metric.autoPoints, 22.5],
  [Metric.teleopPoints, 7.5],
])(
  "includes the correct climb bonuses in population metric %s",
  async (metric, expected) => {
    db.$queryRawUnsafe.mockResolvedValue([
      {
        tournamentKey: "event",
        matchPoints: 10,
        accuracy: 3,
        autoClimb: "SUCCEEDED",
        endgameClimb: "L2",
      },
    ]);
    expect(await averageAllTeamFast(testUser, { metric })).toBe(expected);
  },
);
it.each(["3.5", null])("converts nullable SQL averages %s", async (value) => {
  db.$queryRawUnsafe.mockResolvedValue([{ avg: value }]);
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.defenseEffectiveness }),
  ).toBe(value === null ? 0 : 3.5);
});
it("calculates a completed population scoring interval", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    { scoutReportUuid: "r", action: "START_SCORING", time: 10, quantity: null },
    { scoutReportUuid: "r", action: "STOP_SCORING", time: 20, quantity: 10 },
  ]);
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.fuelPerSecond }),
  ).toBe(1);
});
it.each([
  [Metric.contactDefenseTime, 2],
  [Metric.campingDefenseTime, 3],
  [Metric.totalDefenseTime, 5],
])(
  "calculates completed population defense intervals for %s",
  async (metric, expected) => {
    db.$queryRawUnsafe.mockResolvedValue(
      observedEvents
        .filter((e) =>
          [
            "START_DEFENDING",
            "STOP_DEFENDING",
            "START_CAMPING",
            "STOP_CAMPING",
          ].includes(e.action),
        )
        .map((e) => ({ ...e, scoutReportUuid: "r" })),
    );
    expect(await averageAllTeamFast(testUser, { metric })).toBe(expected);
  },
);
it.each([
  [Metric.totalBallsFed, 4],
  [Metric.feedingRate, 2],
  [Metric.timeFeeding, 2],
])(
  "pools population feeding data including a report without feeding for %s",
  async (metric, expected) => {
    db.$queryRawUnsafe.mockResolvedValue([
      {
        scoutReportUuid: "active",
        action: "START_FEEDING",
        time: 50,
        quantity: null,
      },
      {
        scoutReportUuid: "active",
        action: "STOP_FEEDING",
        time: 54,
        quantity: 8,
      },
      {
        scoutReportUuid: "inactive",
        action: "START_FEEDING",
        time: 60,
        quantity: null,
      },
    ]);
    expect(await averageAllTeamFast(testUser, { metric })).toBe(expected);
  },
);
it.each([
  [Metric.l1StartTime, "L1"],
  [Metric.l2StartTime, "L2"],
  [Metric.l3StartTime, "L3"],
] as const)(
  "uses successful %s climb events in team analyses",
  async (metric, endgameClimb) => {
    db.teamMatchData.findMany.mockResolvedValue([
      { ...rows()[0], scoutReports: [{ ...observedReport, endgameClimb }] },
    ]);
    expect(
      (await averageManyFast(testUser, { teams: [254], metrics: [metric] }))[
        metric
      ][254],
    ).toBe(8);
    expect(
      (await arrayAndAverageTeams(testUser, { teams: [254], metric }))[254]
        .average,
    ).toBe(8);
  },
);
it.each([Metric.autoClimbStartTime, Metric.l1StartTime])(
  "omits successful climb records with no matching events from timelines %s",
  async (metric) => {
    db.teamMatchData.findMany.mockResolvedValue([
      {
        ...rows()[0],
        scoutReports: [
          { ...report, autoClimb: "SUCCEEDED", endgameClimb: "L1" },
        ],
      },
    ]);
    expect(
      (await arrayAndAverageTeams(testUser, { teams: [254], metric }))[254]
        .timeLine[0].dataPoint,
    ).toBe(-1);
  },
);
it("restricts tournament selections consistently for batch and timeline analyses", async () => {
  const scopedUser = {
    ...testUser,
    tournamentSourceRule: { mode: "INCLUDE", items: ["2026test"] },
  };
  await averageManyFast(scopedUser, {
    teams: [254],
    metrics: [Metric.totalPoints],
  });
  await arrayAndAverageTeams(scopedUser, {
    teams: [254],
    metric: Metric.totalPoints,
  });
  expect(db.teamMatchData.findMany).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      where: { teamNumber: { in: [254] }, tournamentKey: { in: ["2026test"] } },
    }),
  );
  expect(db.teamMatchData.findMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      where: { teamNumber: { in: [254] }, tournamentKey: { in: ["2026test"] } },
    }),
  );
});
it("uses inclusion rules for categorical SQL queries", async () => {
  await nonEventMetric(
    {
      ...testUser,
      tournamentSourceRule: { mode: "INCLUDE", items: ["2026test"] },
    },
    { team: 254, metric: MetricsBreakdown.robotRole },
  );
  expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
    expect.stringContaining('tmd."tournamentKey" = ANY($1)'),
    ["2026test"],
    [8033],
    254,
  );
});
it.each([
  Metric.fuelPerSecond,
  Metric.totalFuelOutputted,
  Metric.totalBallThroughput,
  Metric.totalBallsFed,
  Metric.feedingRate,
])(
  "treats unknown event quantities as zero for team metric %s",
  async (metric) => {
    db.teamMatchData.findMany.mockResolvedValue([
      {
        ...rows()[0],
        scoutReports: [
          {
            ...report,
            events: observedEvents.map((e) => ({ ...e, quantity: null })),
          },
        ],
      },
    ]);
    expect(
      (await averageManyFast(testUser, { teams: [254], metrics: [metric] }))[
        metric
      ][254],
    ).toBe(0);
    expect(
      (await arrayAndAverageTeams(testUser, { teams: [254], metric }))[254]
        .average,
    ).toBe(0);
  },
);
it.each([Metric.totalPoints, Metric.autoPoints, Metric.teleopPoints])(
  "defaults absent point fields on partial event projections to zero for %s",
  async (metric) => {
    db.teamMatchData.findMany.mockResolvedValue([
      {
        ...rows()[0],
        scoutReports: [
          { ...report, events: [{ action: "STOP_SCORING", time: 10 }] },
        ],
      },
    ]);
    expect(
      (await arrayAndAverageTeams(testUser, { teams: [254], metric }))[254]
        .average,
    ).toBe(0);
  },
);
it.each([Metric.autoClimbStartTime, Metric.l1StartTime])(
  "handles absent timestamps in partial climb projections for %s",
  async (metric) => {
    db.teamMatchData.findMany.mockResolvedValue([
      {
        ...rows()[0],
        scoutReports: [
          {
            ...report,
            autoClimb: "SUCCEEDED",
            endgameClimb: "L1",
            events: [{ action: "CLIMB" }],
          },
        ],
      },
    ]);
    expect(
      (await arrayAndAverageTeams(testUser, { teams: [254], metric }))[254]
        .timeLine[0].dataPoint,
    ).toBe(metric === Metric.autoClimbStartTime ? 23 : -1);
  },
);
it("treats unknown population feeding quantities as zero", async () => {
  db.$queryRawUnsafe.mockResolvedValue([
    { scoutReportUuid: "r", action: "STOP_FEEDING", time: 10, quantity: null },
  ]);
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.totalBallsFed }),
  ).toBe(0);
});
