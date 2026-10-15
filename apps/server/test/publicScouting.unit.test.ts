import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const mocks = vi.hoisted(() => ({
  match: vi.fn(),
  events: vi.fn(),
  predict: vi.fn(),
  metrics: vi.fn(),
  district: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    tournament: { findMany: vi.fn().mockResolvedValue([]) },
    match: { findUnique: mocks.match },
    districtSeason: { findUnique: mocks.district },
    teamMatchData: { findMany: mocks.events },
  },
}));
vi.mock("../src/lib/publicCache.js", () => ({
  publicCache: async (_key: string, calculate: () => Promise<unknown>) =>
    calculate(),
}));
vi.mock("../src/handler/analysis/predictions/matchPredictionLogic.js", () => ({
  matchPredictionLogic: mocks.predict,
}));
vi.mock("../src/handler/analysis/coreAnalysis/arrayAndAverageTeams.js", () => ({
  arrayAndAverageTeams: mocks.metrics,
}));
import {
  getPublicMatchAnalysis,
  getPublicTeamMetrics,
  getPublicTeamSeries,
  getPublicMatchMetrics,
  mostCommonRoles,
  metricPercentile,
  scoutingCoverage,
  getPublicDistrictLeaderboard,
  getPublicPrediction,
} from "../src/handler/tournaments/publicScouting.js";
import { chooseRobotPhoto } from "../src/handler/tournaments/getRobotPhoto.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.events.mockImplementation(async (args) =>
    args.distinct[0] === "teamNumber"
      ? [{ teamNumber: 8033 }]
      : [{ tournamentKey: "2026casnf" }],
  );
  mocks.match.mockResolvedValue({
    tournament: { seasonYear: 2026 },
    teamSlots: [1, 2, 3, 4, 5, 6].map((teamNumber) => ({
      teamNumber,
      alliance: teamNumber <= 3 ? "BLUE" : "RED",
      scoutReports: [{ robotRoles: ["SCORING"] }],
      notes: "private",
    })),
  });
  mocks.predict.mockResolvedValue({
    blueWinning: 0.7,
    redWinning: 0.3,
    privateNotes: "secret",
  });
});

describe("public scouting projections", () => {
  it("uses all approved sources within the season and exposes only probabilities and match roles", async () => {
    const response = await invoke(getPublicMatchAnalysis, {
      params: { key: "2026casnf_qm4" },
    });
    expect(response.body).toEqual({
      coverage: { reported: 6, expected: 6, complete: true },
      prediction: { blueWinning: 0.7, redWinning: 0.3 },
      roles: [1, 2, 3, 4, 5, 6].map((teamNumber) => ({
        teamNumber,
        role: "SCORING",
      })),
    });
    expect(mocks.events.mock.calls[0]![0].where.tournament).toEqual({
      seasonYear: 2026,
    });
    expect(mocks.predict.mock.calls[0]![0]).toMatchObject({
      id: "public-scouting:2026",
      teamSourceRule: { mode: "EXCLUDE", items: [] },
      tournamentSourceRule: { mode: "INCLUDE", items: ["2026casnf"] },
    });
    expect(mocks.predict.mock.calls[0]![1]).toEqual({
      blue1: 1,
      blue2: 2,
      blue3: 3,
      red1: 4,
      red2: 5,
      red3: 6,
    });
    expect(
      mocks.match.mock.calls[0]![0].select.teamSlots.select.scoutReports,
    ).toEqual({ select: { robotRoles: true } });
  });
  it("keeps roles when prediction data is insufficient", async () => {
    mocks.predict.mockRejectedValue("not enough data");
    const response = await invoke(getPublicMatchAnalysis, {
      params: { key: "2026casnf_qm4" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ prediction: null });
  });
  it.each([2025, 2026])(
    "does not predict older games or four-team matches (%s)",
    async (year) => {
      const match = await mocks.match();
      match.tournament.seasonYear = year;
      if (year === 2026)
        match.teamSlots.push({
          teamNumber: 7,
          alliance: "BLUE",
          scoutReports: [],
        });
      mocks.match.mockResolvedValue(match);
      await invoke(getPublicMatchAnalysis, {
        params: { key: `${year}casnf_qm4` },
      });
      expect(mocks.predict).not.toHaveBeenCalled();
    },
  );
  it("projects metrics without scouting timelines", async () => {
    mocks.metrics.mockResolvedValue({
      8033: { average: 42, timeLine: [{ match: "private", dataPoint: 42 }] },
    });
    const response = await invoke(getPublicTeamMetrics, {
      params: { number: "8033", year: "2026" },
    });
    expect(response.body).toEqual({
      metrics: {
        matches: 1,
        points: 42,
        auto: 42,
        teleop: 42,
        percentiles: { points: null, auto: null, teleop: null },
      },
    });
  });
  it("rejects malformed keys without querying reports", async () => {
    expect(
      (await invoke(getPublicMatchAnalysis, { params: { key: "bad" } }))
        .statusCode,
    ).toBe(400);
    expect(mocks.match).not.toHaveBeenCalled();
  });
  it("deduplicates votes and returns every tied top role", () => {
    expect(
      mostCommonRoles([
        { robotRoles: ["SCORING", "SCORING"] },
        { robotRoles: ["DEFENDING"] },
      ]),
    ).toEqual(["DEFENDING", "SCORING"]);
    expect(
      mostCommonRoles([
        { robotRoles: ["SCORING"] },
        { robotRoles: ["SCORING", "FEEDING"] },
      ]),
    ).toEqual(["SCORING"]);
    expect(mostCommonRoles([])).toEqual([]);
  });
});

describe("season metric percentiles", () => {
  it("gives ordered values their rank and ties a shared midpoint", () => {
    expect(metricPercentile(10, [10, 20, 30])).toBe(0);
    expect(metricPercentile(20, [10, 20, 30])).toBe(50);
    expect(metricPercentile(30, [10, 20, 30])).toBe(100);
    expect(metricPercentile(20, [10, 20, 20, 30])).toBe(50);
    expect(metricPercentile(0, [0, 0, 0])).toBe(50);
    expect(metricPercentile(42, [42])).toBeNull();
    expect(metricPercentile(42, [])).toBeNull();
  });
  it("ranks the three metrics independently within the approved season cohort", async () => {
    mocks.events.mockImplementation(async (args) =>
      args.distinct[0] === "teamNumber"
        ? [{ teamNumber: 8033 }, { teamNumber: 1 }]
        : [{ tournamentKey: "2026casnf" }],
    );
    let index = 0;
    mocks.metrics.mockImplementation(async () => {
      const target = [42, 10, 30][index++];
      return {
        8033: { average: target, timeLine: [{ match: "private" }] },
        1: { average: 20, timeLine: [{ match: "private" }] },
      };
    });
    const response = await invoke(getPublicTeamMetrics, {
      params: { number: "8033", year: "2026" },
    });
    expect(response.body).toEqual({
      metrics: {
        matches: 1,
        points: 42,
        auto: 10,
        teleop: 30,
        percentiles: { points: 100, auto: 0, teleop: 100 },
      },
    });
    expect(mocks.events.mock.calls[0]![0]).toMatchObject({
      where: { tournament: { seasonYear: 2026 }, scoutReports: { some: {} } },
      distinct: ["teamNumber"],
      select: { teamNumber: true },
    });
    expect(mocks.metrics.mock.calls[0]![1].teams).toEqual([8033, 1]);
  });
});

describe("public match metrics", () => {
  it("returns only the current slot's aggregate, never season averages or raw reports", async () => {
    mocks.match.mockResolvedValue({
      tournament: { key: "2026casnf", seasonYear: 2026 },
      teamSlots: [
        {
          key: "slot-8033",
          teamNumber: 8033,
          alliance: "BLUE",
          _count: { scoutReports: 2 },
        },
        {
          key: "slot-1",
          teamNumber: 1,
          alliance: "RED",
          _count: { scoutReports: 0 },
        },
      ],
    });
    mocks.metrics.mockResolvedValue({
      8033: {
        average: 999,
        timeLine: [
          { match: "other-slot", dataPoint: 999 },
          { match: "slot-8033", dataPoint: 42 },
        ],
      },
    });
    const response = await invoke(getPublicMatchMetrics, {
      params: { key: "2026casnf_qm4" },
    });
    expect(response.body).toEqual({
      teams: [
        {
          teamNumber: 8033,
          alliance: "BLUE",
          reports: 2,
          points: 42,
          auto: 42,
          teleop: 42,
          fuelOutput: 42,
          fuelFed: 42,
          defenseSeconds: 42,
        },
      ],
    });
    expect(mocks.metrics.mock.calls[0]![0]).toMatchObject({
      teamSourceRule: { mode: "EXCLUDE", items: [] },
      tournamentSourceRule: { mode: "INCLUDE", items: ["2026casnf"] },
    });
    expect(mocks.metrics.mock.calls[0]![1].teams).toEqual([8033]);
    expect(mocks.match.mock.calls[0]![0].select.teamSlots.select).toEqual({
      key: true,
      teamNumber: true,
      alliance: true,
      _count: { select: { scoutReports: true } },
    });
  });
  it("hides unsupported seasons and unscouted matches", async () => {
    mocks.match.mockResolvedValue({
      tournament: { key: "2025casnf", seasonYear: 2025 },
      teamSlots: [],
    });
    expect(
      (
        await invoke(getPublicMatchMetrics, {
          params: { key: "2025casnf_qm4" },
        })
      ).body,
    ).toEqual({ teams: [] });
    mocks.match.mockResolvedValue({
      tournament: { key: "2026casnf", seasonYear: 2026 },
      teamSlots: [],
    });
    expect(
      (
        await invoke(getPublicMatchMetrics, {
          params: { key: "2026casnf_qm4" },
        })
      ).body,
    ).toEqual({ teams: [] });
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
  it("rejects malformed keys and handles missing matches and failures", async () => {
    expect(
      (await invoke(getPublicMatchMetrics, { params: { key: "bad" } }))
        .statusCode,
    ).toBe(400);
    mocks.match.mockResolvedValue(null);
    expect(
      (
        await invoke(getPublicMatchMetrics, {
          params: { key: "2026casnf_qm4" },
        })
      ).statusCode,
    ).toBe(404);
    mocks.match.mockRejectedValue(new Error("secret"));
    expect(
      (
        await invoke(getPublicMatchMetrics, {
          params: { key: "2026casnf_qm4" },
        })
      ).body,
    ).toEqual({ error: "Scouting metrics unavailable" });
  });
});

describe("robot media", () => {
  it("prefers supported photos over avatars and unsafe links", () => {
    expect(
      chooseRobotPhoto([
        {
          type: "avatar",
          preferred: true,
          direct_url: "https://i.imgur.com/avatar.png",
        },
        {
          type: "imgur",
          preferred: true,
          direct_url: "https://evil.example/robot.jpg",
        },
        { type: "imgur", direct_url: "https://i.imgur.com/other.jpg" },
        {
          type: "imgur",
          preferred: true,
          direct_url: "https://i.imgur.com/robot.jpeg",
        },
      ]),
    ).toBe("https://i.imgur.com/robot.jpeg");
    expect(
      chooseRobotPhoto([
        {
          type: "imgur",
          direct_url: "https://user:secret@i.imgur.com/photo.jpg",
        },
      ]),
    ).toBeNull();
  });
});

describe("public team series", () => {
  it("projects per-match averages and tied roles in event/match order without raw reports", async () => {
    const slot = (key: string, matchNumber: number, roles = ["SCORING"]) => ({
      key,
      matchNumber,
      matchKey: `2026casnf_qm${matchNumber}`,
      matchType: "QUALIFICATION",
      tournamentKey: "2026casnf",
      tournament: { name: "San Francisco", startDate: new Date("2026-03-13") },
      match: {
        displayOrder: matchNumber,
        actualTime: null,
        scheduledTime: null,
      },
      scoutReports: roles.map((role) => ({
        robotRoles: [role],
        robotBrokeDescription:
          role === "FEEDING" ? "private failure details" : null,
        notes: "private",
        scouterUuid: "private",
      })),
    });
    mocks.events.mockResolvedValueOnce([
      slot("second", 2),
      slot("first", 1, ["FEEDING", "SCORING"]),
    ]);
    mocks.events.mockResolvedValueOnce([{ tournamentKey: "2026casnf" }]);
    mocks.metrics.mockResolvedValue({
      8033: {
        average: 999,
        timeLine: [
          { match: "first", dataPoint: 0, notes: "private" },
          { match: "second", dataPoint: 42 },
          { match: "unrelated", dataPoint: 9000 },
        ],
      },
    });

    const response = await invoke(getPublicTeamSeries, {
      params: { number: "8033", year: "2026" },
    });

    expect(response.body).toEqual({
      matches: [
        {
          matchKey: "2026casnf_qm1",
          reports: 2,
          elimination: false,
          reportedBroken: true,
          coverage: { reported: 0, expected: 0, complete: false },
          eventKey: "2026casnf",
          eventName: "San Francisco",
          label: "Qualification 1",
          points: 0,
          auto: 0,
          teleop: 0,
          feeding: 0,
          roles: ["FEEDING", "SCORING"],
        },
        {
          matchKey: "2026casnf_qm2",
          reports: 1,
          elimination: false,
          reportedBroken: false,
          coverage: { reported: 0, expected: 0, complete: false },
          eventKey: "2026casnf",
          eventName: "San Francisco",
          label: "Qualification 2",
          points: 42,
          auto: 42,
          teleop: 42,
          feeding: 42,
          roles: ["SCORING"],
        },
      ],
    });
    expect(mocks.events.mock.calls[0]![0].where).toEqual({
      teamNumber: 8033,
      tournament: { seasonYear: 2026 },
    });
    expect(mocks.events.mock.calls[0]![0].select.scoutReports).toEqual({
      select: { robotRoles: true, robotBrokeDescription: true },
    });
    expect(mocks.metrics.mock.calls[0]![0]).toMatchObject({
      teamSourceRule: { mode: "EXCLUDE", items: [] },
      tournamentSourceRule: { mode: "INCLUDE", items: ["2026casnf"] },
    });
    expect(mocks.metrics.mock.calls[0]![1].teams).toEqual([8033]);
  });

  it("keeps missing/non-finite measurements null and supports slots without imported matches", async () => {
    mocks.events.mockResolvedValueOnce([
      {
        key: "legacy",
        matchKey: null,
        matchNumber: 3,
        matchType: "ELIMINATION",
        tournamentKey: "2026casnf",
        tournament: { name: "San Francisco", startDate: null },
        match: null,
        scoutReports: [],
      },
    ]);
    mocks.events.mockResolvedValueOnce([{ tournamentKey: "2026casnf" }]);
    mocks.metrics.mockResolvedValue({
      8033: { timeLine: [{ match: "legacy", dataPoint: NaN }] },
    });

    const response = await invoke(getPublicTeamSeries, {
      params: { number: "8033", year: "2026" },
    });
    expect(response.body).toEqual({
      matches: [
        {
          matchKey: null,
          reports: 0,
          elimination: true,
          reportedBroken: false,
          coverage: null,
          eventKey: "2026casnf",
          eventName: "San Francisco",
          label: "Elimination 3",
          points: null,
          auto: null,
          teleop: null,
          feeding: null,
          roles: [],
        },
      ],
    });
  });

  it("does not run the current scoring engine on other seasons or empty teams", async () => {
    expect(
      (
        await invoke(getPublicTeamSeries, {
          params: { number: "8033", year: "2025" },
        })
      ).body,
    ).toEqual({ matches: [] });
    expect(mocks.events).not.toHaveBeenCalled();
    mocks.events.mockResolvedValueOnce([]);
    expect(
      (
        await invoke(getPublicTeamSeries, {
          params: { number: "8033", year: "2026" },
        })
      ).body,
    ).toEqual({ matches: [] });
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("rejects invalid parameters and hides upstream failures", async () => {
    expect(
      (
        await invoke(getPublicTeamSeries, {
          params: { number: "0", year: "2026" },
        })
      ).statusCode,
    ).toBe(400);
    mocks.events.mockRejectedValueOnce(new Error("private database details"));
    const response = await invoke(getPublicTeamSeries, {
      params: { number: "8033", year: "2026" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ error: "Team analytics unavailable" });
  });
});

describe("scouting coverage", () => {
  const slots = () =>
    [1, 2, 3, 4, 5, 6].map((teamNumber) => ({
      teamNumber,
      alliance: teamNumber <= 3 ? "BLUE" : "RED",
      scoutReports: [{}],
    }));
  it("requires six distinct participants with a report each, not six reports", () => {
    expect(scoutingCoverage(slots())).toEqual({
      reported: 6,
      expected: 6,
      complete: true,
    });
    const partial = slots();
    partial[5]!.scoutReports = [];
    partial[0]!.scoutReports = [{}, {}, {}];
    expect(scoutingCoverage(partial)).toEqual({
      reported: 5,
      expected: 6,
      complete: false,
    });
    expect(scoutingCoverage([]).complete).toBe(false);
    const duplicate = slots();
    duplicate[5]!.teamNumber = 1;
    expect(scoutingCoverage(duplicate).complete).toBe(false);
  });
});

describe("district scouting leaderboard", () => {
  it("filters cached season metrics to district members only", async () => {
    mocks.district.mockResolvedValue({
      seasonYear: 2026,
      teamSeasons: [{ teamNumber: 8033, name: "Highlander Robotics" }],
    });
    mocks.events.mockImplementation(async (args) =>
      args.distinct[0] === "teamNumber"
        ? [{ teamNumber: 8033 }, { teamNumber: 1 }]
        : [{ tournamentKey: "2026casnf" }],
    );
    mocks.metrics.mockResolvedValue({
      8033: { average: 42, timeLine: [{}] },
      1: { average: 99, timeLine: [{}] },
    });
    const response = await invoke(getPublicDistrictLeaderboard, {
      params: { key: "2026ca" },
    });
    expect(response.body).toEqual({
      teams: [
        {
          number: 8033,
          name: "Highlander Robotics",
          matches: 1,
          points: 42,
          auto: 42,
          teleop: 42,
        },
      ],
    });
  });
  it("handles unsupported seasons, missing districts, invalid keys, and errors", async () => {
    expect(
      (await invoke(getPublicDistrictLeaderboard, { params: { key: "bad" } }))
        .statusCode,
    ).toBe(400);
    mocks.district.mockResolvedValue(null);
    expect(
      (
        await invoke(getPublicDistrictLeaderboard, {
          params: { key: "2026ca" },
        })
      ).statusCode,
    ).toBe(404);
    mocks.district.mockResolvedValue({ seasonYear: 2025, teamSeasons: [] });
    expect(
      (
        await invoke(getPublicDistrictLeaderboard, {
          params: { key: "2025ca" },
        })
      ).body,
    ).toEqual({ teams: [] });
    expect(mocks.metrics).not.toHaveBeenCalled();
    mocks.district.mockRejectedValue(new Error("private"));
    expect(
      (
        await invoke(getPublicDistrictLeaderboard, {
          params: { key: "2026ca" },
        })
      ).body,
    ).toEqual({ error: "Leaderboard unavailable" });
  });
});

describe("custom public predictor", () => {
  it("validates six distinct teams and the supported game before querying", async () => {
    for (const query of [
      { teams: "1,1,2,3,4,5", year: "2026" },
      { teams: "1,2,3,4,5,6", year: "2025" },
      { teams: "1,2,3,4,5,2147483648", year: "2026" },
    ])
      expect((await invoke(getPublicPrediction, { query })).statusCode).toBe(
        400,
      );
    expect(mocks.predict).not.toHaveBeenCalled();
  });
  it("returns only prediction probabilities and handles unavailable data", async () => {
    const query = { teams: "1,2,3,4,5,6", year: "2026" };
    expect((await invoke(getPublicPrediction, { query })).body).toEqual({
      prediction: { blueWinning: 0.7, redWinning: 0.3 },
    });
    mocks.predict.mockRejectedValue("not enough data");
    expect((await invoke(getPublicPrediction, { query })).body).toEqual({
      prediction: null,
    });
    mocks.predict.mockRejectedValue(new Error("private"));
    expect((await invoke(getPublicPrediction, { query })).body).toEqual({
      error: "Prediction unavailable",
    });
  });
});

it("keeps unscouted matches in the series as gaps even if a metric result exists", async () => {
  mocks.events.mockResolvedValueOnce([
    {
      key: "unscouted",
      matchKey: "2026casnf_qm2",
      matchNumber: 2,
      matchType: "QUALIFICATION",
      tournamentKey: "2026casnf",
      tournament: { name: "SF", startDate: null },
      match: null,
      scoutReports: [],
    },
    {
      key: "scouted",
      matchKey: "2026casnf_qm1",
      matchNumber: 1,
      matchType: "QUALIFICATION",
      tournamentKey: "2026casnf",
      tournament: { name: "SF", startDate: null },
      match: null,
      scoutReports: [{ robotRoles: [], robotBrokeDescription: null }],
    },
  ]);
  mocks.events.mockResolvedValueOnce([{ tournamentKey: "2026casnf" }]);
  mocks.metrics.mockResolvedValue({
    8033: {
      timeLine: [
        { match: "unscouted", dataPoint: 999 },
        { match: "scouted", dataPoint: 0 },
      ],
    },
  });
  const response = await invoke(getPublicTeamSeries, {
    params: { number: "8033", year: "2026" },
  });
  expect(response.body).toMatchObject({
    matches: [
      { matchKey: "2026casnf_qm1", points: 0, reports: 1 },
      {
        matchKey: "2026casnf_qm2",
        points: null,
        auto: null,
        feeding: null,
        reports: 0,
      },
    ],
  });
  expect(mocks.events.mock.calls[0]![0].where).not.toHaveProperty(
    "scoutReports",
  );
});
