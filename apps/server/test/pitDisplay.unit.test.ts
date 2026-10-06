import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  teamMatchData: { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() },
  user: { findUnique: vi.fn() },
  get: vi.fn(),
  predict: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("axios", () => ({ default: { get: db.get } }));
vi.mock("../src/handler/analysis/predictions/matchPredictionLogic.js", () => ({
  matchPredictionLogic: db.predict,
}));
import { pitDisplay } from "../src/handler/manager/pitDisplay.js";
const row = (matchNumber: number, matchType = "QUALIFICATION") => ({
  matchNumber,
  matchType,
  tournamentKey: "2026test",
  key: `q${matchNumber}_0`,
  teamNumber: 254,
});
const six = () =>
  [254, 971, 8033, 1, 2, 3].map((teamNumber, index) => ({
    ...row(2),
    key: `q2_${index}`,
    teamNumber,
  }));
const run = (query = {}) =>
  invoke(pitDisplay, {
    query: {
      team: "254",
      tournamentKey: "2026test",
      topTeamCount: "1",
      teamsAboveCount: "1",
      ...query,
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  db.teamMatchData.findMany.mockResolvedValue(six());
  db.teamMatchData.findFirst
    .mockResolvedValueOnce(row(1))
    .mockResolvedValueOnce(row(5))
    .mockResolvedValueOnce(row(1));
  db.teamMatchData.groupBy.mockResolvedValue([row(1)]);
  db.get
    .mockResolvedValueOnce({
      data: { webcasts: [{ type: "youtube", channel: "test" }] },
    })
    .mockResolvedValueOnce({
      data: {
        rankings: [254, 971, 8033, 1].map((team, i) => ({
          team_key: `frc${team}`,
          extra_stats: [10 - i],
          rank: i + 1,
        })),
      },
    });
  db.user.findUnique.mockResolvedValue({ id: "pit" });
  db.predict.mockResolvedValue({ redWinning: 0.7, blueWinning: 0.3 });
});
afterEach(() => vi.restoreAllMocks());
it("returns webcasts, rankings, alliance predictions, and a same-phase team timeline", async () => {
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    webcasts: [{ type: "youtube", channel: "test" }],
    matches: {
      nowPlaying: {
        key: "2026test_qm2",
        alliances: {
          red: { teams: [254, 971, 8033], winPrediction: 0.7 },
          blue: { teams: [1, 2, 3], winPrediction: 0.3 },
        },
      },
      next: { key: "2026test_qm3" },
      teamNext: { key: "2026test_qm5" },
    },
    teamMatchTimeline: { matchCount: 4, currentMatchCount: 2 },
  });
  expect(db.teamMatchData.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        teamNumber: 254,
        key: { notIn: expect.arrayContaining(["2026test_qm1_5"]) },
      }),
    }),
  );
});
it("rejects malformed input without contacting services", async () => {
  expect((await run({ team: "bad" })).statusCode).toBe(400);
  expect(db.get).not.toHaveBeenCalled();
});
it("reports a team without event matches", async () => {
  db.teamMatchData.findMany.mockResolvedValue([]);
  expect((await run()).statusCode).toBe(500);
});
it("returns event information before the first report is uploaded", async () => {
  db.teamMatchData.findFirst.mockReset().mockResolvedValue(null);
  expect((await run()).body).toMatchObject({
    matches: {},
    teamMatchTimeline: {},
    webcasts: expect.any(Array),
  });
});
it("returns null for an incomplete upcoming alliance", async () => {
  db.teamMatchData.findMany
    .mockReset()
    .mockResolvedValueOnce(six())
    .mockResolvedValueOnce(six())
    .mockResolvedValueOnce([]);
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    matches: { nowPlaying: expect.any(Object), next: null },
    teamMatchTimeline: {},
  });
});
it("does not dereference a team's next match after it finishes the event", async () => {
  db.teamMatchData.findFirst
    .mockReset()
    .mockResolvedValueOnce(row(1))
    .mockResolvedValueOnce(null);
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    matches: { next: expect.any(Object) },
    teamMatchTimeline: {},
  });
});
it("omits predictions when there is insufficient scouting data", async () => {
  db.predict.mockRejectedValue("not enough data");
  expect((await run()).body).toMatchObject({
    matches: {
      nowPlaying: {
        alliances: {
          red: { teams: [254, 971, 8033] },
          blue: { teams: [1, 2, 3] },
        },
      },
    },
  });
});
it("propagates unexpected prediction failures", async () => {
  db.predict.mockRejectedValue(new Error("prediction"));
  expect((await run()).statusCode).toBe(500);
});
it("reports event service failures", async () => {
  db.get.mockReset().mockRejectedValue(new Error("TBA"));
  expect((await run()).statusCode).toBe(500);
});
it("collapses rankings between the leaders and the selected team", async () => {
  const result = await run({ team: "1" });
  expect(result.body).toMatchObject({
    rankingBlocks: [
      { type: "team", number: 254 },
      { type: "collapsedDivider", teamCount: 1 },
      { type: "team", number: 8033 },
      { type: "team", number: 1 },
    ],
  });
});
it.each(["971", "999"])(
  "retains the full ranking list for a near-top or unranked team %s",
  async (team) => {
    expect((await run({ team })).body).toMatchObject({
      rankingBlocks: [
        { number: 254 },
        { number: 971 },
        { number: 8033 },
        { number: 1 },
      ],
    });
  },
);
it.each(["QUALIFICATION", "ELIMINATION"])(
  "counts the qualification-to-playoff transition while %s is playing",
  async (matchType) => {
    db.teamMatchData.findFirst
      .mockReset()
      .mockResolvedValueOnce(row(1, matchType))
      .mockResolvedValueOnce(row(3, "ELIMINATION"))
      .mockResolvedValueOnce(row(1))
      .mockResolvedValueOnce(row(10));
    expect((await run()).body).toMatchObject({
      teamMatchTimeline: {
        matchCount: 12,
        currentMatchCount: matchType === "QUALIFICATION" ? 2 : 12,
      },
    });
  },
);
it("uses the first qualification when the team has no previous report", async () => {
  db.teamMatchData.findFirst
    .mockReset()
    .mockResolvedValueOnce(row(1))
    .mockResolvedValueOnce(row(5))
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(row(1));
  expect((await run()).body).toMatchObject({
    teamMatchTimeline: { matchCount: 4, currentMatchCount: 2 },
  });
});
it("omits a timeline if the previous match is unavailable", async () => {
  db.teamMatchData.findFirst
    .mockReset()
    .mockResolvedValueOnce(row(1))
    .mockResolvedValueOnce(row(5))
    .mockResolvedValue(null);
  expect((await run()).statusCode).toBe(200);
});
it("omits transition timing when qualification metadata is missing", async () => {
  db.teamMatchData.findFirst
    .mockReset()
    .mockResolvedValueOnce(row(1))
    .mockResolvedValueOnce(row(3, "ELIMINATION"))
    .mockResolvedValueOnce(row(1))
    .mockResolvedValueOnce(null);
  expect((await run()).body).toMatchObject({ teamMatchTimeline: {} });
});
it.each([{ topTeamCount: "-1" }, { teamsAboveCount: "1.5" }])(
  "rejects invalid ranking window sizes %j",
  async (query) => {
    expect((await run(query)).statusCode).toBe(400);
  },
);
