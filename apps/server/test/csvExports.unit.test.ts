import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const mocks = vi.hoisted(() => ({
  team: { findMany: vi.fn().mockResolvedValue([]) },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  teamMatchData: { findMany: vi.fn(), groupBy: vi.fn() },
  scoutReport: { findMany: vi.fn() },
  get: vi.fn(),
  average: vi.fn(),
  many: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: mocks }));
vi.mock("axios", () => ({ default: { get: mocks.get } }));
vi.mock("../src/handler/analysis/coreAnalysis/averageScoutReport.js", () => ({
  averageScoutReport: mocks.average,
}));
vi.mock("../src/handler/analysis/coreAnalysis/averageManyFast.js", () => ({
  averageManyFast: mocks.many,
}));
import { Metric, autoEnd } from "../src/handler/analysis/analysisConstants.js";
import { getReportCSV } from "../src/handler/analysis/csv/getReportCSV.js";
import { getTeamCSV } from "../src/handler/analysis/csv/getTeamCSV.js";
const report = {
  uuid: "report",
  notes: "Good, robot",
  robotRoles: ["SCORING", "FEEDING"],
  autoClimb: "SUCCEEDED",
  endgameClimb: "L2",
  fieldTraversal: "TRENCH",
  beached: "NEITHER",
  scoresWhileMoving: true,
  disrupts: false,
  feederTypes: ["CONTINUOUS"],
  intakeType: "NEITHER",
  accuracy: 3,
  driverAbility: 4,
  defenseEffectiveness: 2,
  events: [
    { time: 10, points: 5 },
    { time: 100, points: 10 },
  ],
  scouter: { sourceTeamNumber: 8033, name: "Scout, Name" },
  teamMatchData: {
    teamNumber: 254,
    matchNumber: 1,
    matchType: "QUALIFICATION",
  },
};
const parse = (body: unknown) => {
  const [header, ...rows] = String(body)
    .trim()
    .replace(/^\uFEFF/, "")
    .split("\n");
  return rows.map((row) =>
    Object.fromEntries(
      header.split(",").map((key, i) => [key, row.split(",")[i]]),
    ),
  );
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.scoutReport.findMany.mockResolvedValue([report]);
  mocks.teamMatchData.findMany.mockResolvedValue([
    { teamNumber: 254, scoutReports: [report] },
  ]);
  mocks.teamMatchData.groupBy.mockResolvedValue([
    { teamNumber: 254, _count: { key: 1 } },
  ]);
  mocks.average.mockResolvedValue(
    Object.fromEntries(
      Object.values(Metric)
        .filter((x) => typeof x === "number")
        .map((x) => [x, 12.34]),
    ),
  );
  mocks.many.mockResolvedValue(
    Object.fromEntries(
      Object.values(Metric)
        .filter((x) => typeof x === "number")
        .map((x) => [x, { 254: 12.34 }]),
    ),
  );
  mocks.get.mockResolvedValue({ data: [] });
});
afterEach(() => vi.restoreAllMocks());
for (const handler of [getReportCSV, getTeamCSV]) {
  it(`${handler.name} validates a selected tournament before querying`, async () => {
    expect((await invoke(handler)).statusCode).toBe(400);
    expect(mocks.scoutReport.findMany).not.toHaveBeenCalled();
    expect(mocks.teamMatchData.findMany).not.toHaveBeenCalled();
  });
  it(`${handler.name} reports database failures`, async () => {
    mocks.scoutReport.findMany.mockRejectedValue(new Error("offline"));
    mocks.teamMatchData.findMany.mockRejectedValue(new Error("offline"));
    expect(
      (await invoke(handler, { query: { tournamentKey: "2026test" } }))
        .statusCode,
    ).toBe(500);
  });
  it.each([{ auto: "1" }, { teleop: "1" }, { auto: "1", teleop: "1" }, {}])(
    `${handler.name} respects requested event phases (%j)`,
    async (query) => {
      const result = await invoke(handler, {
        query: { tournamentKey: "2026test", ...query },
      });
      expect(result.statusCode).toBe(200);
      expect(result.headers["Content-Type"]).toBe("text/csv");
      expect(String(result.body)).toMatch(/^\uFEFF/);
      const eventFilter =
        query.auto && !query.teleop
          ? { time: { lte: autoEnd } }
          : query.teleop && !query.auto
            ? { time: { gt: autoEnd } }
            : undefined;
      if (handler === getReportCSV) {
        expect(mocks.scoutReport.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              teamMatchData: { tournamentKey: "2026test" },
              scouter: { sourceTeamNumber: { in: [8033] } },
            },
            select: expect.objectContaining({
              events: expect.objectContaining({ where: eventFilter }),
            }),
          }),
        );
      } else {
        expect(mocks.teamMatchData.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            select: expect.objectContaining({
              scoutReports: expect.objectContaining({
                where: { scouter: { sourceTeamNumber: { in: [8033] } } },
                select: expect.objectContaining({
                  events: expect.objectContaining({ where: eventFilter }),
                }),
              }),
            }),
          }),
        );
      }
    },
  );
}
it("exports report metrics, categorical fields, boolean text and sanitized notes", async () => {
  const response = await invoke(getReportCSV, {
    query: { tournamentKey: "2026test" },
  });
  expect(response.headers["Content-Disposition"]).toContain(
    "lovatReportsDownload.csv",
  );
  const [row] = parse(response.body);
  expect(row).toMatchObject({
    match: "Q1",
    teamNumber: "254",
    totalPoints: "12.34",
    autoPoints: "5",
    teleopPoints: "30",
    feedingRate: "12.34",
    robotRoles: "SCORING|FEEDING",
    scoresWhileMoving: "TRUE",
    disrupts: "FALSE",
    scouter: "Scout; Name",
    notes: "Good; robot",
  });
});
it("does not expose another team's scouter name", async () => {
  mocks.scoutReport.findMany.mockResolvedValue([
    { ...report, scouter: { sourceTeamNumber: 971, name: "Private" } },
  ]);
  expect(
    parse(
      (await invoke(getReportCSV, { query: { tournamentKey: "2026test" } }))
        .body,
    )[0].scouter,
  ).toBe("");
});
it("reports no data instead of an empty report export", async () => {
  mocks.scoutReport.findMany.mockResolvedValue([]);
  expect(
    (await invoke(getReportCSV, { query: { tournamentKey: "2026test" } }))
      .statusCode,
  ).toBe(400);
});
it("defaults missing report values and derives points without an analysis UUID", async () => {
  mocks.scoutReport.findMany.mockResolvedValue([
    { events: [{}], scouter: {}, teamMatchData: {} },
  ]);
  const [row] = parse(
    (await invoke(getReportCSV, { query: { tournamentKey: "2026test" } })).body,
  );
  expect(row).toMatchObject({
    match: "",
    teamNumber: "0",
    totalPoints: "0",
    autoPoints: "0",
    teleopPoints: "0",
    robotRoles: "",
    fieldTraversal: "N/A",
    scouter: "",
    notes: "",
  });
});
it("ignores missing and non-finite report metrics", async () => {
  mocks.average.mockResolvedValue({
    [Metric.totalPoints]: NaN,
    [Metric.fuelPerSecond]: Infinity,
  });
  const [row] = parse(
    (await invoke(getReportCSV, { query: { tournamentKey: "2026test" } })).body,
  );
  expect(row).toMatchObject({ totalPoints: "35", fuelPerSecond: "0" });
});
it("exports team summaries without double-counting duplicate report observations", async () => {
  mocks.teamMatchData.findMany.mockResolvedValue([
    {
      teamNumber: 254,
      scoutReports: [report, { ...report, fieldTraversal: "BUMP" }],
    },
  ]);
  const response = await invoke(getTeamCSV, {
    query: { tournamentKey: "2026test" },
  });
  expect(response.headers["Content-Disposition"]).toContain(
    "teamDataDownload.csv",
  );
  const [row] = parse(response.body);
  expect(row).toMatchObject({
    teamNumber: "254",
    avgTotalPoints: "12.34",
    avgFeedingRate: "12.34",
    numMatches: "1",
    numReports: "2",
    fieldTraversal: "BOTH",
    percScoresWhileMoving: "100",
    percDisrupts: "0",
    percClimbTwo: "100",
  });
});
it.each([undefined, [], [{ team_number: 254 }]])(
  "reports absent event reports or TBA teams (%j)",
  async (teams) => {
    mocks.teamMatchData.findMany.mockResolvedValue([]);
    mocks.get.mockResolvedValue({ data: teams });
    mocks.scoutReport.findMany.mockResolvedValue([]);
    expect(
      (await invoke(getTeamCSV, { query: { tournamentKey: "2026test" } }))
        .statusCode,
    ).toBe(400);
  },
);
it("returns no-data when TBA is unavailable", async () => {
  mocks.teamMatchData.findMany.mockResolvedValue([]);
  mocks.get.mockRejectedValue(new Error("offline"));
  expect(
    (await invoke(getTeamCSV, { query: { tournamentKey: "2026test" } }))
      .statusCode,
  ).toBe(400);
});
it("exports visible history for TBA teams without current event match data", async () => {
  mocks.teamMatchData.findMany.mockResolvedValue([]);
  mocks.get.mockResolvedValue({ data: [{ team_number: 254 }] });
  const response = await invoke(getTeamCSV, {
    query: { tournamentKey: "2026test" },
    user: {
      ...testUser,
      tournamentSourceRule: { mode: "INCLUDE", items: ["2025history"] },
    },
  });
  expect(response.statusCode).toBe(200);
  expect(parse(response.body)[0]).toMatchObject({
    teamNumber: "254",
    numMatches: "1",
    numReports: "1",
  });
  expect(mocks.scoutReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        teamMatchData: {
          teamNumber: { in: [254] },
          tournamentKey: { in: ["2025history"] },
        },
        scouter: { sourceTeamNumber: { in: [8033] } },
      },
    }),
  );
});
it.each(["L1", "L3", "NOT_ATTEMPTED"])(
  "exports climb and movement percentages (%s)",
  async (climb) => {
    mocks.teamMatchData.findMany.mockResolvedValue([
      {
        teamNumber: 254,
        scoutReports: [
          {
            ...report,
            endgameClimb: climb,
            fieldTraversal: "BOTH",
            robotRoles: [],
            autoClimb: "NOT_ATTEMPTED",
            scoresWhileMoving: false,
            disrupts: true,
          },
        ],
      },
    ]);
    mocks.many.mockResolvedValue({});
    const [row] = parse(
      (await invoke(getTeamCSV, { query: { tournamentKey: "2026test" } })).body,
    );
    expect(row).toMatchObject({
      mainRole: "IMMOBILE",
      secondaryRole: "NONE",
      fieldTraversal: "BOTH",
      percDisrupts: "100",
      percAutoClimb: "0",
      avgTotalPoints: "0",
    });
    expect(
      row[
        climb === "L1"
          ? "percClimbOne"
          : climb === "L3"
            ? "percClimbThree"
            : "percNoClimb"
      ],
    ).toBe("100");
  },
);
for (const handler of [getReportCSV, getTeamCSV])
  it(`${handler.name} fails closed on malformed team visibility`, async () => {
    const response = await invoke(handler, {
      query: { tournamentKey: "2026test" },
      user: { ...testUser, teamSourceRule: null },
    });
    expect(response.statusCode).toBe(500);
    expect(mocks.scoutReport.findMany).not.toHaveBeenCalled();
    expect(mocks.teamMatchData.findMany).not.toHaveBeenCalled();
  });
it("does not fetch unrestricted historical reports for malformed tournament visibility", async () => {
  mocks.teamMatchData.findMany.mockResolvedValue([]);
  mocks.get.mockResolvedValue({ data: [{ team_number: 254 }] });
  const response = await invoke(getTeamCSV, {
    query: { tournamentKey: "2026test" },
    user: { ...testUser, tournamentSourceRule: null },
  });
  expect(response.statusCode).toBe(400);
  expect(mocks.scoutReport.findMany).not.toHaveBeenCalled();
});
