import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SHA256 from "crypto-js/sha256.js";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  registeredTeam: { findUnique: vi.fn() },
  scouter: { findUnique: vi.fn() },
  scouterScheduleShift: { findMany: vi.fn(), groupBy: vi.fn() },
  tournament: { findMany: vi.fn() },
  teamMatchData: { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() },
  team: { findMany: vi.fn() },
  importMatches: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: db.importMatches,
}));
import { getScheduleForScouter } from "../src/handler/manager/scouters/getScheduleForScouter.js";
import { getScouterSchedule } from "../src/handler/manager/tournament/getScouterSchedule.js";
import { getTournamentForScouterWithSchedule } from "../src/handler/manager/scouters/getTournamentForScouterWithSchedule.js";
import { getTournamentsWithSchedule } from "../src/handler/manager/getTournamentWithSchedule.js";
import { getScouterTournaments } from "../src/handler/manager/scouters/getScouterTournaments.js";
import { getTeamsInTournament } from "../src/handler/manager/tournament/getTeamsInTournament.js";
const params = { tournament: "2026test", uuid: "scouter" };
const headers = { "x-team-code": "code" };
const shift = {
  startMatchOrdinalNumber: 1,
  endMatchOrdinalNumber: 2,
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((i) => [
      `team${i}`,
      [{ uuid: `s${i}`, name: `Scout ${i}` }],
    ]),
  ),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
  db.scouter.findUnique.mockResolvedValue({ sourceTeamNumber: 8033 });
  db.scouterScheduleShift.findMany.mockResolvedValue([shift]);
  db.scouterScheduleShift.groupBy.mockResolvedValue([
    { tournamentKey: "2026test" },
  ]);
  db.teamMatchData.findFirst.mockResolvedValue({ matchNumber: 1 });
  db.teamMatchData.findMany.mockResolvedValue(
    [1, 2, 3, 4, 5, 6].map((teamNumber) => ({ teamNumber })),
  );
  db.teamMatchData.groupBy.mockResolvedValue([{ tournamentKey: "2026test" }]);
  db.tournament.findMany.mockImplementation(async () => [
    { key: "other", name: "Other" },
    { key: "2026test", name: "Test" },
  ]);
  db.team.findMany.mockResolvedValue([{ number: 254 }]);
});
afterEach(() => vi.restoreAllMocks());
for (const handler of [
  getScheduleForScouter,
  getScouterSchedule,
  getTournamentForScouterWithSchedule,
  getTournamentsWithSchedule,
  getTeamsInTournament,
]) {
  it(`${handler.name} rejects missing identifying input`, async () => {
    expect((await invoke(handler)).statusCode).toBe(400);
  });
  it(`${handler.name} reports database failure`, async () => {
    db.registeredTeam.findUnique.mockRejectedValue(new Error("offline"));
    db.scouter.findUnique.mockRejectedValue(new Error("offline"));
    db.scouterScheduleShift.findMany.mockRejectedValue(new Error("offline"));
    db.teamMatchData.findMany.mockRejectedValue(new Error("offline"));
    expect((await invoke(handler, { params, headers })).statusCode).toBe(500);
  });
}
it("expands schedules into qualification and elimination assignments for both alliances", async () => {
  const result = await invoke(getScheduleForScouter, { params, headers });
  expect(result.statusCode).toBe(200);
  expect(result.body).toEqual({
    hash: SHA256(JSON.stringify([shift])).toString(),
    data: [0, 1].map((matchType) => ({
      matchType,
      matchNumber: 1,
      scouters: Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((i) => [
          `s${i}`,
          { team: i, alliance: i <= 3 ? "red" : "blue" },
        ]),
      ),
    })),
  });
  expect(db.scouterScheduleShift.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { sourceTeamNumber: 8033, tournamentKey: "2026test" },
    }),
  );
});
it("denies unknown Collection team codes", async () => {
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(getScheduleForScouter, { params, headers })).statusCode,
  ).toBe(400);
});
it("reports unavailable qualification matches", async () => {
  db.teamMatchData.findFirst.mockResolvedValue(null);
  expect(
    (await invoke(getScheduleForScouter, { params, headers })).statusCode,
  ).toBe(400);
});
it.each([0, 5])(
  "skips absent matches or reports incomplete imported matches (%s)",
  async (count) => {
    db.teamMatchData.findMany.mockResolvedValue(
      Array.from({ length: count }, (_, i) => ({ teamNumber: i })),
    );
    const result = await invoke(getScheduleForScouter, { params, headers });
    expect(result.statusCode).toBe(count === 0 ? 200 : 400);
    if (count === 0) expect(result.body).toMatchObject({ data: [] });
  },
);
it("returns team-scoped Dashboard shifts with a deterministic change hash", async () => {
  const result = await invoke(getScouterSchedule, { params });
  expect(result.body).toEqual({
    hash: SHA256(JSON.stringify([shift])).toString(),
    data: [shift],
  });
  expect(db.scouterScheduleShift.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { sourceTeamNumber: 8033, tournamentKey: "2026test" },
    }),
  );
});
it("denies teamless Dashboard schedule reads", async () => {
  expect(
    (
      await invoke(getScouterSchedule, {
        params,
        user: { ...testUser, teamNumber: null },
      })
    ).statusCode,
  ).toBe(403);
  expect(db.scouterScheduleShift.findMany).not.toHaveBeenCalled();
});
it("lists scheduled tournaments for the Collection team code", async () => {
  expect(
    (await invoke(getTournamentForScouterWithSchedule, { headers })).statusCode,
  ).toBe(200);
  expect(db.tournament.findMany).toHaveBeenCalledWith({
    where: { scouterScheduleShifts: { some: { sourceTeamNumber: 8033 } } },
  });
});
it("lists scheduled tournaments for the scouter's source team", async () => {
  expect(
    (await invoke(getTournamentsWithSchedule, { params })).statusCode,
  ).toBe(200);
  expect(db.scouterScheduleShift.groupBy).toHaveBeenCalledWith({
    by: ["tournamentKey"],
    where: { sourceTeamNumber: 8033 },
  });
  expect(db.tournament.findMany).toHaveBeenCalledWith({
    where: { key: { in: ["2026test"] } },
  });
});
it("deduplicates event teams before looking up team names", async () => {
  db.teamMatchData.findMany.mockResolvedValue([
    { teamNumber: 254 },
    { teamNumber: 254 },
    { teamNumber: 971 },
  ]);
  expect((await invoke(getTeamsInTournament, { params })).body).toEqual([
    { number: 254 },
  ]);
  expect(db.team.findMany).toHaveBeenCalledWith({
    where: { number: { in: [254, 971] } },
  });
});
it("reports missing tournament team rows", async () => {
  db.teamMatchData.findMany.mockResolvedValue([]);
  expect((await invoke(getTeamsInTournament, { params })).statusCode).toBe(404);
});
it.each([
  {},
  { skip: "1" },
  { take: "2" },
  { skip: "1", take: "2" },
  { filter: "test" },
  { filter: "test", skip: "1" },
  { filter: "test", take: "2" },
  { filter: "test", skip: "1", take: "2" },
])(
  "paginates Collection tournament discovery and prioritizes the team's events (%j)",
  async (query) => {
    const result = await invoke(getScouterTournaments, { query, headers });
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      tournaments: [
        { key: "2026test", name: "Test" },
        { key: "other", name: "Other" },
      ],
      count: 2,
    });
    expect(db.tournament.findMany).toHaveBeenCalledWith({
      ...(query.skip ? { skip: 1 } : {}),
      ...(query.take ? { take: 2 } : {}),
      ...(query.filter
        ? {
            where: {
              OR: [
                { key: { contains: "test" } },
                { name: { contains: "test" } },
              ],
            },
          }
        : {}),
      orderBy: { date: "asc" },
    });
  },
);
it.each([
  { skip: "bad" },
  { take: "bad" },
  { skip: "bad", take: "2" },
  { filter: ["bad"] },
  { filter: "test", skip: "bad" },
  { filter: "test", take: "bad" },
  { filter: "test", skip: "bad", take: "2" },
])("rejects malformed tournament pagination (%j)", async (query) => {
  expect(
    (await invoke(getScouterTournaments, { query, headers })).statusCode,
  ).toBe(400);
});
it("requires a valid Collection code before returning tournaments", async () => {
  expect((await invoke(getScouterTournaments)).statusCode).toBe(400);
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect((await invoke(getScouterTournaments, { headers })).statusCode).toBe(
    400,
  );
});
it("reports failed tournament discovery", async () => {
  db.tournament.findMany.mockRejectedValue(new Error("offline"));
  expect((await invoke(getScouterTournaments, { headers })).statusCode).toBe(
    500,
  );
});

it("returns the filtered page rather than the initial unfiltered tournament rows", async () => {
  db.tournament.findMany
    .mockResolvedValueOnce([{ key: "initial" }])
    .mockResolvedValueOnce([{ key: "selected" }])
    .mockResolvedValueOnce([{ key: "selected" }]);
  expect(
    (
      await invoke(getScouterTournaments, {
        headers,
        query: { filter: "selected", skip: "1", take: "1" },
      })
    ).body,
  ).toEqual({ tournaments: [{ key: "selected" }], count: 1 });
});
