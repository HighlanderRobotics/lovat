import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  team: { findMany: vi.fn() },
  tournament: { findMany: vi.fn() },
  teamMatchData: { groupBy: vi.fn(), findFirst: vi.fn() },
  registeredTeam: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));
const pullMatches = vi.hoisted(() => vi.fn());
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: pullMatches,
}));
const { getTeams } = await import("../src/handler/manager/getTeams.js");
const { getTournaments } =
  await import("../src/handler/manager/getTournaments.js");
const { getAnalysts } = await import("../src/handler/manager/getAnalysts.js");
const { getUsers } = await import("../src/handler/manager/getUsers.js");
const { getProfile } = await import("../src/handler/manager/getProfile.js");
const { getTeamCode } = await import("../src/handler/manager/getTeamCode.js");
const { deleteUser } = await import("../src/handler/manager/deleteUser.js");
const { checkMatchExists } =
  await import("../src/handler/manager/checkMatchExists.js");
const { checkOnlyOneInstanceOfScouter } =
  await import("../src/handler/manager/checkOnlyInstanceOfScouter.js");
const teams = [
  { number: 254, name: "Other team" },
  { number: 8033, name: "Own team" },
];
const tournaments = [
  { key: "2026other", name: "Other event" },
  { key: "2026own", name: "Own event" },
];
const queryCases = [
  {},
  { take: "2" },
  { skip: "1" },
  { take: "2", skip: "1" },
  { filter: "2026" },
  { filter: "2026", take: "2" },
  { filter: "2026", skip: "1" },
  { filter: "2026", take: "2", skip: "1" },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  db.team.findMany.mockImplementation(async () =>
    teams.map((row) => ({ ...row })),
  );
  db.$queryRaw.mockImplementation(async () => teams.map((row) => ({ ...row })));
  db.tournament.findMany.mockImplementation(async () =>
    tournaments.map((row) => ({ ...row })),
  );
  db.teamMatchData.groupBy.mockResolvedValue([{ tournamentKey: "2026own" }]);
  db.user.findMany.mockResolvedValue([
    { id: "analyst", username: "Analyst", email: "analyst@example.invalid" },
  ]);
  db.user.findUnique.mockResolvedValue(testUser);
  db.registeredTeam.findUnique.mockResolvedValue({
    code: "team-code",
    teamApproved: true,
    emailVerified: true,
  });
});
afterEach(() => vi.restoreAllMocks());

for (const handler of [getTeams, getTournaments]) {
  describe(handler.name, () => {
    it.each(queryCases)(
      "returns the requested page and prioritizes the caller's team (%j)",
      async (query) => {
        const response = await invoke(handler, { query });
        expect(response.statusCode).toBe(200);
        if (handler === getTeams) {
          expect(response.body).toEqual({
            teams: [teams[1], teams[0]],
            count: 2,
          });
          if (query.filter) {
            const [strings, ...values] = db.$queryRaw.mock.calls[0];
            expect(strings.join("")).toContain("ILIKE");
            expect(values).toContain("2026%");
            if (query.take) {
              expect(strings.join("")).toContain("LIMIT");
              expect(values).toContain(2);
            }
            if (query.skip) {
              expect(strings.join("")).toContain("OFFSET");
              expect(values).toContain(1);
            }
          } else
            expect(db.team.findMany).toHaveBeenCalledWith({
              ...(query.take ? { take: 2 } : {}),
              ...(query.skip ? { skip: 1 } : {}),
            });
        } else {
          expect(response.body).toEqual({
            tournaments: [
              { ...tournaments[1], isParticipant: true },
              { ...tournaments[0], isParticipant: false },
            ],
            count: 2,
          });
          if (Object.keys(query).length)
            expect(db.tournament.findMany).toHaveBeenCalledWith({
              ...(query.take ? { take: 2 } : {}),
              ...(query.skip ? { skip: 1 } : {}),
              ...(query.filter
                ? {
                    where: {
                      OR: [
                        { key: { contains: "2026" } },
                        { name: { contains: "2026" } },
                      ],
                    },
                  }
                : {}),
              orderBy: { date: "asc" },
            });
        }
      },
    );
    it.each(queryCases.slice(1))(
      "rejects malformed pagination (%j)",
      async (query) => {
        const invalid = {
          ...query,
          ...(query.take
            ? { take: "bad" }
            : query.skip
              ? { skip: "bad" }
              : { filter: ["a", "b"] }),
        };
        expect((await invoke(handler, { query: invalid })).statusCode).toBe(
          400,
        );
      },
    );
    it("retains natural ordering when the caller has no team", async () => {
      const response = await invoke(handler, {
        user: { ...testUser, teamNumber: null },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(
        handler === getTeams
          ? { teams, count: 2 }
          : {
              tournaments: tournaments.map((row) => ({
                ...row,
                isParticipant: false,
              })),
              count: 2,
            },
      );
    });
    it("retains natural ordering when the caller's team is outside the page", async () => {
      const response = await invoke(handler, {
        user: { ...testUser, teamNumber: 9999 },
      });
      expect(response.statusCode).toBe(200);
      if (handler === getTeams)
        expect(response.body).toEqual({ teams, count: 2 });
    });
    it("reports database failures instead of publishing a partial page", async () => {
      db.team.findMany.mockRejectedValue(new Error("offline"));
      db.tournament.findMany.mockRejectedValue(new Error("offline"));
      expect((await invoke(handler)).statusCode).toBe(500);
    });
  });
}

for (const handler of [getAnalysts, getUsers, getProfile]) {
  describe(handler.name, () => {
    it("returns the authorized user's requested profile or team members", async () => {
      const response = await invoke(handler);
      expect(response.statusCode).toBe(200);
      if (handler === getProfile) {
        expect(response.body).toEqual(testUser);
        expect(db.user.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: testUser.id } }),
        );
      } else {
        expect(response.body).toEqual([
          {
            id: "analyst",
            username: "Analyst",
            email: "analyst@example.invalid",
          },
        ]);
        expect(db.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              teamNumber: 8033,
              ...(handler === getAnalysts ? { role: "ANALYST" } : {}),
            },
          }),
        );
      }
    });
    it("reports failed user lookup", async () => {
      db.user.findMany.mockRejectedValue(new Error("offline"));
      db.user.findUnique.mockRejectedValue(new Error("offline"));
      expect((await invoke(handler)).statusCode).toBe(500);
    });
  });
}

it("does not reveal analysts without scouting lead permissions", async () => {
  expect(
    (await invoke(getAnalysts, { user: { ...testUser, role: "ANALYST" } }))
      .statusCode,
  ).toBe(403);
  expect(db.user.findMany).not.toHaveBeenCalled();
});
it("does not look up users for teamless callers", async () => {
  expect(
    (await invoke(getAnalysts, { user: { ...testUser, teamNumber: null } }))
      .statusCode,
  ).toBe(404);
  expect(
    (await invoke(getUsers, { user: { ...testUser, teamNumber: null } })).body,
  ).toEqual([]);
  expect(db.user.findMany).not.toHaveBeenCalled();
});

describe("team code access", () => {
  it("returns approved, verified team codes only to leads", async () => {
    expect((await invoke(getTeamCode)).body).toBe("team-code");
    expect(db.registeredTeam.findUnique).toHaveBeenCalledWith({
      where: { number: 8033 },
    });
  });
  it("denies analysts before lookup", async () => {
    expect(
      (await invoke(getTeamCode, { user: { ...testUser, role: "ANALYST" } }))
        .statusCode,
    ).toBe(403);
    expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
  });
  it.each([
    { teamApproved: false, emailVerified: true },
    { teamApproved: true, emailVerified: false },
  ])("withholds unapproved or unverified codes (%j)", async (row) => {
    db.registeredTeam.findUnique.mockResolvedValue(row);
    expect((await invoke(getTeamCode)).statusCode).toBe(400);
  });
  it("reports failed verification lookup", async () => {
    db.registeredTeam.findUnique.mockRejectedValue(new Error("offline"));
    expect((await invoke(getTeamCode)).statusCode).toBe(500);
  });
});

describe("deleting the current user", () => {
  it("blocks API key self-deletion", async () => {
    expect((await invoke(deleteUser, { tokenType: "apiKey" })).statusCode).toBe(
      403,
    );
    expect(db.user.delete).not.toHaveBeenCalled();
  });
  it("preserves the last scouting lead", async () => {
    expect((await invoke(deleteUser)).statusCode).toBe(400);
    expect(db.user.delete).not.toHaveBeenCalled();
  });
  it.each(["ANALYST", "SCOUTING_LEAD"] as const)(
    "deletes only the authenticated %s when leadership remains",
    async (role) => {
      db.user.findMany.mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }]);
      expect(
        (await invoke(deleteUser, { user: { ...testUser, role } })).statusCode,
      ).toBe(200);
      expect(db.user.delete).toHaveBeenCalledWith({
        where: { id: testUser.id },
      });
    },
  );
  it("reports failed deletion", async () => {
    db.user.findMany.mockResolvedValue([]);
    db.user.delete.mockRejectedValue(new Error("offline"));
    expect((await invoke(deleteUser)).statusCode).toBe(500);
  });
});

describe("Collection match existence", () => {
  const query = {
    tournamentKey: "2026test",
    teamNumber: "8033",
    matchNumber: "1",
    isElim: "false",
  };
  it.each([
    ["false", "QUALIFICATION", "red", "match_0"],
    ["true", "ELIMINATION", "blue", "match_5"],
  ])(
    "resolves %s elimination flags and alliance positions",
    async (isElim, matchType, alliance, key) => {
      db.teamMatchData.findFirst.mockResolvedValue({ key });
      const response = await invoke(checkMatchExists, {
        query: { ...query, isElim },
      });
      expect(response.body).toEqual({ match: { key }, alliance });
      expect(pullMatches).toHaveBeenCalledWith("2026test");
      expect(db.teamMatchData.findFirst).toHaveBeenCalledWith({
        where: {
          matchNumber: 1,
          tournamentKey: "2026test",
          teamNumber: 8033,
          matchType,
        },
      });
    },
  );
  it("reports missing matches", async () => {
    db.teamMatchData.findFirst.mockResolvedValue(null);
    expect((await invoke(checkMatchExists, { query })).statusCode).toBe(404);
  });
  it("rejects incomplete parameters before importing matches", async () => {
    expect((await invoke(checkMatchExists)).statusCode).toBe(400);
    expect(pullMatches).not.toHaveBeenCalled();
  });
  it("reports import failures", async () => {
    pullMatches.mockRejectedValue(new Error("offline"));
    expect((await invoke(checkMatchExists, { query })).statusCode).toBe(500);
  });
});

describe("scouter assignment uniqueness", () => {
  it("accepts six disjoint assignments", async () => {
    expect(
      await checkOnlyOneInstanceOfScouter(
        ["a"],
        ["b"],
        ["c"],
        ["d"],
        ["e"],
        ["f"],
      ),
    ).toBe(true);
  });
  it.each([0, 1, 2, 3, 4, 5])(
    "rejects duplicates in assignment %s",
    async (index) => {
      const slots: [
        string[],
        string[],
        string[],
        string[],
        string[],
        string[],
      ] = [[], [], [], [], [], []];
      slots[index] = ["a", "a"];
      expect(await checkOnlyOneInstanceOfScouter(...slots)).toBe(false);
    },
  );
  it("rejects a scouter assigned to two robots", async () => {
    expect(
      await checkOnlyOneInstanceOfScouter(["a"], ["a"], [], [], [], []),
    ).toBe(false);
  });
  it("propagates malformed assignment failures", async () => {
    await expect(
      checkOnlyOneInstanceOfScouter(
        null as unknown as string[],
        [],
        [],
        [],
        [],
        [],
      ),
    ).rejects.toThrow();
  });
});
