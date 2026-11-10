import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  team: { upsert: vi.fn() },
  teamMatchData: { groupBy: vi.fn() },
  emailVerificationRequest: { deleteMany: vi.fn() },
  registeredTeam: { deleteMany: vi.fn() },
  addMatches: vi.fn(),
}));
vi.mock("axios", () => ({ default: { get: mocks.get } }));
vi.mock("../src/prismaClient.js", () => ({ default: mocks }));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: mocks.addMatches,
}));
import fetchTeams from "../src/lib/fetchTeams.js";
import fetchMatches from "../src/lib/fetchMatches.js";
import deleteOldRequests from "../src/lib/deleteOldRequests.js";
import { arrayToRule } from "../src/lib/migrateDataSources.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T12:00:00Z"));
  vi.stubEnv("TBA_KEY", "synthetic-key");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("upserts each team page and stops at the first empty page", async () => {
  mocks.get
    .mockResolvedValueOnce({
      data: [{ team_number: 254, nickname: "Team 254" }],
    })
    .mockResolvedValueOnce({
      data: [{ team_number: 8033, nickname: "Team 8033" }],
    })
    .mockResolvedValueOnce({ data: [] });
  await fetchTeams();
  expect(mocks.get.mock.calls.map(([url]) => url)).toEqual(
    [0, 1, 2].map(
      (page) => `https://www.thebluealliance.com/api/v3/teams/${page}/simple`,
    ),
  );
  expect(mocks.get).toHaveBeenCalledWith(expect.any(String), {
    headers: { "X-TBA-Auth-Key": "synthetic-key" },
  });
  expect(mocks.team.upsert).toHaveBeenCalledTimes(2);
  expect(mocks.team.upsert).toHaveBeenCalledWith({
    where: { number: 8033 },
    update: { name: "Team 8033" },
    create: { number: 8033, name: "Team 8033" },
  });
});
it("does not write teams for an empty first page", async () => {
  mocks.get.mockResolvedValue({ data: [] });
  await fetchTeams();
  expect(mocks.get).toHaveBeenCalledOnce();
  expect(mocks.team.upsert).not.toHaveBeenCalled();
});
it("propagates team import errors", async () => {
  mocks.get.mockRejectedValue(new Error("offline"));
  await expect(fetchTeams()).rejects.toThrow("offline");
});
it("refreshes only distinct tournaments in the current date window", async () => {
  mocks.teamMatchData.groupBy.mockResolvedValue([
    { tournamentKey: "2026a" },
    { tournamentKey: "2026b" },
  ]);
  await fetchMatches();
  const start = new Date();
  start.setDate(start.getDate() - 3);
  const end = new Date();
  end.setDate(end.getDate() + 3);
  expect(mocks.teamMatchData.groupBy).toHaveBeenCalledWith({
    by: ["tournamentKey"],
    where: {
      tournament: {
        date: { gte: start.toDateString(), lte: end.toDateString() },
      },
    },
  });
  expect(mocks.addMatches.mock.calls).toEqual([["2026a"], ["2026b"]]);
});
it("does not refresh when no tournaments are current", async () => {
  mocks.teamMatchData.groupBy.mockResolvedValue([]);
  await fetchMatches();
  expect(mocks.addMatches).not.toHaveBeenCalled();
});
it("cleans up expired requests and only unverified teams older than one day", async () => {
  await deleteOldRequests();
  expect(mocks.emailVerificationRequest.deleteMany).toHaveBeenCalledWith({
    where: { expiresAt: { lt: new Date() } },
  });
  expect(mocks.registeredTeam.deleteMany).toHaveBeenCalledWith({
    where: {
      timeCreated: { lt: new Date("2026-03-11T12:00:00Z") },
      emailVerified: false,
    },
  });
});
it.each([
  { sources: [1, 2, 3, 4], expected: { mode: "EXCLUDE", items: [] } },
  { sources: [1, 2, 3], expected: { mode: "EXCLUDE", items: [4] } },
  { sources: [1, 2], expected: { mode: "EXCLUDE", items: [3, 4] } },
  { sources: [1], expected: { mode: "INCLUDE", items: [1] } },
  { sources: [], expected: { mode: "INCLUDE", items: [] } },
])(
  "preserves visibility while choosing the smaller source filter ($sources)",
  ({ sources, expected }) => {
    expect(arrayToRule(sources, [1, 2, 3, 4])).toEqual(expected);
  },
);
