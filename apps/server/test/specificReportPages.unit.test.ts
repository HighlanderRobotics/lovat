import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  team: { findMany: vi.fn().mockResolvedValue([]) },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  event: { findMany: vi.fn() },
  scoutReport: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  teamMatchData: { findUnique: vi.fn() },
  scouter: { findUnique: vi.fn() },
  cachedAnalysis: { create: vi.fn() },
  get: vi.fn(),
  set: vi.fn(),
  average: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({ kv: { get: db.get, set: db.set } }));
vi.mock("../src/handler/analysis/coreAnalysis/averageScoutReport.js", () => ({
  averageScoutReport: db.average,
}));
import {
  Metric,
  specificMatchPageMetrics,
  metricToName,
  FlippedRoleMap,
  FlippedActionMap,
  FlippedPositionMap,
} from "../src/handler/analysis/analysisConstants.js";
import {
  AutoClimbReverseMap,
  EndgameClimbReverseMap,
  FeederTypeReverseMap,
} from "../src/handler/manager/managerConstants.js";
import { autoPathScouter } from "../src/handler/analysis/specificMatchPage/autoPathScouter.js";
import { matchPageSpecificScouter } from "../src/handler/analysis/specificMatchPage/matchPageSpecificScouter.js";
import { scoutReportForMatch } from "../src/handler/analysis/specificMatchPage/scoutReportForMatch.js";
import { timelineForScoutReport } from "../src/handler/analysis/specificMatchPage/timelineForScoutReport.js";
import { scouterScoutReports } from "../src/handler/analysis/scoutingLead/scouterScoutReports.js";
const report = {
  uuid: "report",
  teamMatchKey: "m1",
  startTime: new Date("2026-01-01"),
  notes: "Test",
  driverAbility: 4,
  defenseEffectiveness: 3,
  robotRoles: ["SCORING"],
  endgameClimb: "L1",
  autoClimb: "SUCCEEDED",
  feederTypes: ["CONTINUOUS"],
  accuracy: 3,
};
const event = { time: 10, action: "STOP_SCORING", position: "HUB", points: 8 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.get.mockResolvedValue(null);
  db.event.findMany.mockResolvedValue([event]);
  db.scoutReport.findUnique.mockResolvedValue(report);
  db.scoutReport.findFirst.mockResolvedValue(report);
  db.scoutReport.findMany.mockResolvedValue([]);
  db.teamMatchData.findUnique.mockResolvedValue({
    tournament: { name: "Test event" },
  });
  db.scouter.findUnique.mockResolvedValue({ sourceTeamNumber: 8033 });
  db.average.mockResolvedValue(
    Object.fromEntries(
      Object.values(Metric)
        .filter((x) => typeof x === "number")
        .map((metric) => [metric, 10]),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());
it("summarizes one scouter's autonomous events and caches by report", async () => {
  expect(
    await autoPathScouter(testUser, {
      matchKey: "m1",
      scoutReportUuid: "report",
    }),
  ).toEqual({
    autoPoints: 8,
    positions: [
      {
        location: FlippedPositionMap.HUB,
        event: FlippedActionMap.STOP_SCORING,
        time: 10,
        quantity: 8,
      },
    ],
    match: "m1",
    tournamentName: "Test event",
    climb: AutoClimbReverseMap.SUCCEEDED,
  });
  expect(db.get).toHaveBeenCalledWith(
    expect.stringContaining("autoPathScouter:m1:report"),
  );
});
it("returns report page metrics and translated categorical values", async () => {
  const result = await invoke(
    (req, res) => matchPageSpecificScouter(req, res, vi.fn()),
    { params: { uuid: "report" } },
  );
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    totalPoints: 10,
    autoPoints: 10,
    driverAbility: 4,
    robotRoles: [FlippedRoleMap.SCORING],
    climb: EndgameClimbReverseMap.L1,
    autoClimb: AutoClimbReverseMap.SUCCEEDED,
    autoClimbStartTime: 143,
    feederType: [FeederTypeReverseMap.CONTINUOUS],
    note: "Test",
  });
  expect(db.scoutReport.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        uuid: "report",
        scouter: { sourceTeamNumber: { in: [8033] } },
        teamMatchData: { tournamentKey: undefined },
      },
    }),
  );
});
it.each([null, undefined])(
  "defaults absent aggregate timing and rate metrics (%s)",
  async (missing) => {
    db.average.mockResolvedValue({ [Metric.autoClimbStartTime]: missing });
    db.scoutReport.findFirst.mockResolvedValue({
      ...report,
      feederTypes: null,
    });
    const result = await invoke(
      (req, res) => matchPageSpecificScouter(req, res, vi.fn()),
      { params: { uuid: "report" } },
    );
    expect(result.body).toMatchObject({
      autoClimbStartTime: 0,
      contactDefenseTime: 0,
      campingDefenseTime: 0,
      totalDefenseTime: 0,
      scoringRate: 0,
      feedingRate: 0,
      feeds: 0,
      feederType: [],
      climbStartTime: 0,
    });
  },
);
it("returns an empty page for an inaccessible report", async () => {
  db.scoutReport.findFirst.mockResolvedValue(null);
  expect(
    (
      await invoke((req, res) => matchPageSpecificScouter(req, res, vi.fn()), {
        params: { uuid: "report" },
      })
    ).body,
  ).toEqual({});
  expect(db.average).not.toHaveBeenCalled();
});
it.each(["SCOUTING_LEAD", "ANALYST"] as const)(
  "masks external report names and permits modifications only for owning leads (%s)",
  async (role) => {
    const reports = [8033, 971].map((sourceTeamNumber) => ({
      uuid: `r${sourceTeamNumber}`,
      scouter: { sourceTeamNumber, name: "Private" },
    }));
    db.scoutReport.findMany.mockResolvedValue(reports);
    expect(
      (
        await invoke((req, res) => scoutReportForMatch(req, res, vi.fn()), {
          params: { match: "m1" },
          user: { ...testUser, role },
        })
      ).body,
    ).toEqual([
      { ...reports[0], canModify: role === "SCOUTING_LEAD" },
      {
        ...reports[1],
        scouter: { sourceTeamNumber: 971, name: "Scouter from 971" },
        canModify: false,
      },
    ]);
  },
);
it("adds points to scored timeline events and omits zero-point values", async () => {
  db.event.findMany.mockResolvedValue([
    event,
    { ...event, time: 20, points: 0 },
  ]);
  expect(
    (
      await invoke((req, res) => timelineForScoutReport(req, res, vi.fn()), {
        params: { uuid: "report" },
      })
    ).body,
  ).toEqual([
    [10, FlippedActionMap.STOP_SCORING, FlippedPositionMap.HUB, 8],
    [20, FlippedActionMap.STOP_SCORING, FlippedPositionMap.HUB],
  ]);
  expect(db.event.findMany).toHaveBeenCalledWith({
    where: {
      scoutReportUuid: "report",
      scoutReport: {
        scouter: { sourceTeamNumber: { in: [8033] } },
        teamMatchData: { tournamentKey: undefined },
      },
    },
    orderBy: { time: "asc" },
  });
});
it.each([undefined, "2026test"])(
  "lists a lead's own scouter reports with optional tournament restriction (%s)",
  async (tournamentKey) => {
    db.scoutReport.findMany.mockResolvedValue([{ uuid: "report" }]);
    const result = await invoke(
      (req, res) => scouterScoutReports(req, res, vi.fn()),
      {
        query: {
          scouterUuid: "scouter",
          ...(tournamentKey ? { tournamentKey } : {}),
        },
      },
    );
    expect(result.body).toEqual([{ uuid: "report" }]);
    expect(db.scoutReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scouterUuid: "scouter",
          ...(tournamentKey ? { teamMatchData: { tournamentKey } } : {}),
        },
      }),
    );
    expect(db.get).not.toHaveBeenCalled();
  },
);
it.each([
  { role: "ANALYST" as const },
  { teamNumber: null },
  { teamNumber: 971 },
])(
  "denies scouting-lead report reads without ownership (%j)",
  async (overrides) => {
    expect(
      (
        await invoke((req, res) => scouterScoutReports(req, res, vi.fn()), {
          query: { scouterUuid: "scouter" },
          user: { ...testUser, ...overrides },
        })
      ).statusCode,
    ).toBe(500);
    expect(db.scoutReport.findMany).not.toHaveBeenCalled();
  },
);
it("reports unknown scouters before reading reports", async () => {
  db.scouter.findUnique.mockResolvedValue(null);
  expect(
    (
      await invoke((req, res) => scouterScoutReports(req, res, vi.fn()), {
        query: { scouterUuid: "scouter" },
      })
    ).statusCode,
  ).toBe(500);
  expect(db.scoutReport.findMany).not.toHaveBeenCalled();
});
it("includes every configured aggregate metric on the specific-scouter page", async () => {
  specificMatchPageMetrics.push(Metric.totalPoints);
  try {
    const result = await invoke(
      (req, res) => matchPageSpecificScouter(req, res, vi.fn()),
      { params: { uuid: "report" } },
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      [metricToName[Metric.totalPoints]]: 10,
    });
  } finally {
    specificMatchPageMetrics.pop();
  }
});
