import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const mocks = vi.hoisted(() => ({
  match: vi.fn(),
  events: vi.fn(),
  predict: vi.fn(),
  metrics: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    tournament: { findMany: vi.fn().mockResolvedValue([]) },
    match: { findUnique: mocks.match },
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
  mostCommonRole,
} from "../src/handler/tournaments/publicScouting.js";
import { chooseRobotPhoto } from "../src/handler/tournaments/getRobotPhoto.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.events.mockResolvedValue([{ tournamentKey: "2026casnf" }]);
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
      metrics: { matches: 1, points: 42, auto: 42, teleop: 42 },
    });
  });
  it("rejects malformed keys without querying reports", async () => {
    expect(
      (await invoke(getPublicMatchAnalysis, { params: { key: "bad" } }))
        .statusCode,
    ).toBe(400);
    expect(mocks.match).not.toHaveBeenCalled();
  });
  it("deduplicates roles within a report and hides ties", () => {
    expect(
      mostCommonRole([
        { robotRoles: ["SCORING", "SCORING"] },
        { robotRoles: ["DEFENDING"] },
      ]),
    ).toBeNull();
    expect(
      mostCommonRole([
        { robotRoles: ["SCORING"] },
        { robotRoles: ["SCORING", "FEEDING"] },
      ]),
    ).toBe("SCORING");
    expect(mostCommonRole([])).toBeNull();
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
