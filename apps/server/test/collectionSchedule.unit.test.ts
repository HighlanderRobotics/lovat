import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  registeredTeam: { findUnique: vi.fn() },
  teamMatchData: { findMany: vi.fn(), findFirst: vi.fn() },
  refresh: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: db.refresh,
}));
import { getMatchSchedule } from "../src/handler/manager/getMatchSchedule.js";
import { checkMatchExists } from "../src/handler/manager/checkMatchExists.js";
beforeEach(() => {
  vi.resetAllMocks();
});
const request = {
  params: { tournament: "2026test" },
  headers: { "x-team-code": "test-code" },
};
it("requires a valid team code before reading schedule rows", async () => {
  expect((await invoke(getMatchSchedule)).statusCode).toBe(400);
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect((await invoke(getMatchSchedule, request)).statusCode).toBe(401);
  expect(db.teamMatchData.findMany).not.toHaveBeenCalled();
});
it("returns only public assignments and scheduled practice teams", async () => {
  db.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
  db.teamMatchData.findMany.mockResolvedValue([
    {
      key: "2026test_qm3_0",
      matchNumber: 3,
      matchType: "QUALIFICATION",
      teamNumber: 8033,
    },
    {
      key: "2026test_qm3_3",
      matchNumber: 3,
      matchType: "QUALIFICATION",
      teamNumber: 254,
    },
    {
      key: "2026test_pm3_8033",
      matchNumber: 3,
      matchType: "PRACTICE",
      teamNumber: 8033,
    },
  ]);
  const response = await invoke(getMatchSchedule, request);
  expect(response.statusCode).toBe(200);
  expect(response.body).toEqual({
    tournamentKey: "2026test",
    matches: [
      {
        matchNumber: 3,
        matchType: 0,
        teams: [
          { number: 8033, alliance: "red" },
          { number: 254, alliance: "blue" },
        ],
      },
      {
        matchNumber: 3,
        matchType: 2,
        teams: [{ number: 8033, alliance: null }],
      },
    ],
  });
  expect(db.teamMatchData.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        tournamentKey: "2026test",
        OR: [
          { matchType: { in: ["QUALIFICATION", "ELIMINATION"] } },
          { matchType: "PRACTICE", practiceScheduled: true },
        ],
      },
      select: {
        key: true,
        matchNumber: true,
        matchType: true,
        teamNumber: true,
      },
    }),
  );
});
it("checks scheduled practice membership without treating a team number as an alliance slot", async () => {
  db.teamMatchData.findFirst.mockResolvedValue({ key: "2026test_pm3_8033" });
  const response = await invoke(checkMatchExists, {
    query: {
      tournamentKey: "2026test",
      matchNumber: "3",
      teamNumber: "8033",
      matchType: "PRACTICE",
    },
  });
  expect(response.body).toEqual({
    match: { key: "2026test_pm3_8033" },
    alliance: null,
  });
  expect(db.teamMatchData.findFirst).toHaveBeenCalledWith({
    where: {
      tournamentKey: "2026test",
      matchNumber: 3,
      teamNumber: 8033,
      matchType: "PRACTICE",
      practiceScheduled: true,
    },
  });
});
