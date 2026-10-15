import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  user: { update: vi.fn() },
  registeredTeam: { findUnique: vi.fn() },
}));
const send = vi.hoisted(() => vi.fn());
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/analysis/analysisConstants.js", () => ({
  allTeamNumbers: Promise.resolve([8033, 254, 1678, 971]),
  allTournaments: Promise.resolve(["a", "b", "c", "d"]),
}));
vi.mock("../src/handler/manager/onboarding/resendEmail.js", () => ({
  sendVerificationEmail: send,
}));
import { addTeamSource } from "../src/handler/manager/settings/addTeamSource.js";
import { addTournamentSource } from "../src/handler/manager/settings/addTournamentSource.js";
import { getTeamSource } from "../src/handler/manager/settings/getTeamSource.js";
import { getTournamentSource } from "../src/handler/manager/settings/getTournamentSource.js";
import { updateSettings } from "../src/handler/manager/settings/updateSettings.js";
import { getTeamEmail } from "../src/handler/manager/settings/getTeamEmail.js";
import { updateTeamEmail } from "../src/handler/manager/settings/updateTeamEmail.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.registeredTeam.findUnique.mockResolvedValue({
    email: "team@example.invalid",
  });
});
afterEach(() => vi.restoreAllMocks());
it.each([
  { body: { mode: "ALL_TEAMS" }, rule: { mode: "EXCLUDE", items: [] } },
  { body: { mode: "THIS_TEAM" }, rule: { mode: "INCLUDE", items: [8033] } },
  { body: { teams: [254] }, rule: { mode: "INCLUDE", items: [254] } },
  {
    body: { teams: [254, 1678, 971] },
    rule: { mode: "EXCLUDE", items: [8033] },
  },
])("stores the requested source visibility ($body)", async ({ body, rule }) => {
  expect((await invoke(addTeamSource, { body })).statusCode).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: testUser.id },
    data: { teamSourceRule: rule },
  });
});
it("denies own-team sources when not affiliated", async () => {
  expect(
    (
      await invoke(addTeamSource, {
        body: { mode: "THIS_TEAM" },
        user: { ...testUser, teamNumber: null },
      })
    ).statusCode,
  ).toBe(403);
  expect(db.user.update).not.toHaveBeenCalled();
});
it.each([
  { rule: { mode: "INCLUDE", items: [8033] }, result: "THIS_TEAM" },
  { rule: { mode: "EXCLUDE", items: [] }, result: "ALL_TEAMS" },
  { rule: { mode: "INCLUDE", items: [254] }, result: [254] },
  { rule: { mode: "INCLUDE", items: [8033, 254] }, result: [8033, 254] },
  { rule: { mode: "EXCLUDE", items: [254] }, result: [8033, 1678, 971] },
])("returns team source preferences ($rule)", async ({ rule, result }) => {
  expect(
    (
      await invoke(getTeamSource, {
        user: { ...testUser, teamSourceRule: rule },
      })
    ).body,
  ).toEqual(result);
});
it("returns tournament preferences using exclusions", async () => {
  expect(
    (
      await invoke(getTournamentSource, {
        user: {
          ...testUser,
          tournamentSourceRule: { mode: "EXCLUDE", items: ["b"] },
        },
      })
    ).body,
  ).toEqual(["a", "c", "d"]);
});
it("stores selected tournament sources", async () => {
  expect(
    (await invoke(addTournamentSource, { body: { tournaments: ["a"] } }))
      .statusCode,
  ).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: testUser.id },
    data: { tournamentSourceRule: { mode: "INCLUDE", items: ["a"] } },
  });
});
it("updates both source rules atomically", async () => {
  expect(
    (
      await invoke(updateSettings, {
        body: { teamSource: [254], tournamentSource: ["a"] },
      })
    ).statusCode,
  ).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: testUser.id },
    data: {
      teamSourceRule: { mode: "INCLUDE", items: [254] },
      tournamentSourceRule: { mode: "INCLUDE", items: ["a"] },
    },
  });
});
for (const handler of [addTeamSource, addTournamentSource, updateSettings]) {
  describe(handler.name, () => {
    it("rejects malformed preferences before writing", async () => {
      expect((await invoke(handler)).statusCode).toBe(400);
      expect(db.user.update).not.toHaveBeenCalled();
    });
    it("reports database write failures", async () => {
      db.user.update.mockRejectedValue(new Error("offline"));
      expect(
        (
          await invoke(handler, {
            body: {
              teams: [],
              tournaments: [],
              teamSource: [],
              tournamentSource: [],
            },
          })
        ).statusCode,
      ).toBe(500);
    });
  });
}
for (const [handler, field] of [
  [getTeamSource, "teamSourceRule"],
  [getTournamentSource, "tournamentSourceRule"],
] as const) {
  it(`${handler.name} rejects malformed stored rules`, async () => {
    expect(
      (
        await invoke(handler, {
          user: { ...testUser, [field]: { mode: "unknown", items: [] } },
        })
      ).statusCode,
    ).toBe(500);
  });
}
it("restricts settings updates to JWT callers", async () => {
  expect(
    (await invoke(updateSettings, { tokenType: "apiKey" })).statusCode,
  ).toBe(403);
  expect(db.user.update).not.toHaveBeenCalled();
});
it("returns team email only to its lead", async () => {
  expect((await invoke(getTeamEmail)).body).toBe("team@example.invalid");
  expect(db.registeredTeam.findUnique).toHaveBeenCalledWith({
    where: { number: 8033 },
    select: { email: true },
  });
  expect(
    (await invoke(getTeamEmail, { user: { ...testUser, role: "ANALYST" } }))
      .statusCode,
  ).toBe(403);
});
it("sends verification to the requested new email", async () => {
  expect(
    (await invoke(updateTeamEmail, { query: { email: "new@example.invalid" } }))
      .statusCode,
  ).toBe(200);
  expect(send).toHaveBeenCalledWith("new@example.invalid", 8033);
});
it("denies API keys and invalid emails", async () => {
  expect(
    (await invoke(updateTeamEmail, { tokenType: "apiKey" })).statusCode,
  ).toBe(403);
  expect(
    (await invoke(updateTeamEmail, { query: { email: "bad" } })).statusCode,
  ).toBe(400);
  expect(send).not.toHaveBeenCalled();
});
for (const handler of [getTeamEmail, updateTeamEmail]) {
  it(`${handler.name} returns missing team`, async () => {
    db.registeredTeam.findUnique.mockResolvedValue(null);
    expect(
      (await invoke(handler, { query: { email: "new@example.invalid" } }))
        .statusCode,
    ).toBe(404);
  });
  it(`${handler.name} reports failed lookup`, async () => {
    db.registeredTeam.findUnique.mockRejectedValue(new Error("offline"));
    expect(
      (await invoke(handler, { query: { email: "new@example.invalid" } }))
        .statusCode,
    ).toBe(500);
  });
}
it("reports new-email verification failures", async () => {
  send.mockRejectedValue(new Error("offline"));
  expect(
    (await invoke(updateTeamEmail, { query: { email: "new@example.invalid" } }))
      .statusCode,
  ).toBe(500);
});
