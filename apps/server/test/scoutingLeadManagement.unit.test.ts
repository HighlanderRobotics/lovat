import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  registeredTeam: { findUnique: vi.fn() },
  scouter: { findMany: vi.fn() },
  teamMatchData: { groupBy: vi.fn() },
  scoutReport: { groupBy: vi.fn() },
  send: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: db.send };
  },
}));
import { emailTeamCode } from "../src/handler/manager/scouters/emailTeamCode.js";
import { updateRoleToScoutingLead } from "../src/handler/manager/scouters/updateRoleToScoutingLead.js";
import { scoutingLeadProgressPage } from "../src/handler/manager/scouters/scoutingLeadProgressPage.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  db.user.findUnique.mockResolvedValue({ ...testUser, id: "other" });
  db.registeredTeam.findUnique.mockResolvedValue({
    email: "lead@example.invalid",
    code: "synthetic",
  });
  db.send.mockResolvedValue({ data: { id: "email" }, error: null });
  db.scouter.findMany.mockResolvedValue([]);
  db.teamMatchData.groupBy.mockResolvedValue([{}, {}, {}, {}]);
  db.scoutReport.groupBy.mockResolvedValue([{}]);
});
afterEach(() => vi.restoreAllMocks());
it("emails the registered team's code and acknowledges delivery", async () => {
  const result = await invoke(emailTeamCode, { query: { teamNumber: "8033" } });
  expect(result.body).toEqual({ email: "lead@example.invalid" });
  expect(db.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "lead@example.invalid",
      html: expect.stringContaining("synthetic"),
    }),
  );
});
it("rejects malformed team code requests", async () => {
  expect(
    (await invoke(emailTeamCode, { query: { teamNumber: "bad" } })).statusCode,
  ).toBe(400);
  expect(db.send).not.toHaveBeenCalled();
});
it("does not email unregistered teams", async () => {
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(emailTeamCode, { query: { teamNumber: "8033" } })).statusCode,
  ).toBe(400);
  expect(db.send).not.toHaveBeenCalled();
});
it("reports database failures during team code lookup", async () => {
  db.registeredTeam.findUnique.mockRejectedValue(new Error("database"));
  expect(
    (await invoke(emailTeamCode, { query: { teamNumber: "8033" } })).statusCode,
  ).toBe(500);
});
it("reports email delivery failures without claiming success", async () => {
  db.send.mockRejectedValue(new Error("delivery"));
  expect(
    (await invoke(emailTeamCode, { query: { teamNumber: "8033" } })).statusCode,
  ).toBe(500);
});
it("promotes a teammate when requested by a lead", async () => {
  expect(
    (await invoke(updateRoleToScoutingLead, { body: { user: "other" } }))
      .statusCode,
  ).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: "other" },
    data: { role: "SCOUTING_LEAD" },
  });
});
it.each([
  [{ tokenType: "apiKey" as const }, 403],
  [{ body: {} }, 400],
  [{ user: { ...testUser, teamNumber: null } }, 404],
  [{ user: { ...testUser, role: "ANALYST" as const } }, 403],
  [{ body: { user: testUser.id } }, 200],
])(
  "does not mutate roles for prohibited or redundant requests %j",
  async (overrides, status) => {
    expect(
      (
        await invoke(updateRoleToScoutingLead, {
          body: { user: "other" },
          ...overrides,
        })
      ).statusCode,
    ).toBe(status);
    expect(db.user.update).not.toHaveBeenCalled();
  },
);
it("rejects users on another team", async () => {
  db.user.findUnique.mockResolvedValue({
    ...testUser,
    id: "other",
    teamNumber: 971,
  });
  expect(
    (await invoke(updateRoleToScoutingLead, { body: { user: "other" } }))
      .statusCode,
  ).toBe(403);
  expect(db.user.update).not.toHaveBeenCalled();
});
it("returns not found for a deleted target", async () => {
  db.user.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(updateRoleToScoutingLead, { body: { user: "other" } }))
      .statusCode,
  ).toBe(404);
});
it("reports failed role persistence", async () => {
  db.user.update.mockRejectedValue(new Error("database"));
  expect(
    (await invoke(updateRoleToScoutingLead, { body: { user: "other" } }))
      .statusCode,
  ).toBe(500);
});
it.each([
  [{ query: { tournamentKey: [] } }, 400],
  [{ user: { ...testUser, teamNumber: null } }, 400],
  [{ user: { ...testUser, role: "ANALYST" as const } }, 400],
])("validates lead progress access %j", async (overrides, status) => {
  expect((await invoke(scoutingLeadProgressPage, overrides)).statusCode).toBe(
    status,
  );
  expect(db.scouter.findMany).not.toHaveBeenCalled();
});
it("lists all-time progress using team and archive filters", async () => {
  db.scouter.findMany.mockResolvedValue([
    { uuid: "s", name: "Scout", scoutReports: [{}, {}] },
  ]);
  const result = await invoke(scoutingLeadProgressPage, {
    query: { archived: "false" },
  });
  expect(result.body).toEqual([
    {
      scouterUuid: "s",
      scouterName: "Scout",
      matchesScouted: 2,
      missedMatches: 0,
    },
  ]);
  expect(db.scouter.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { sourceTeamNumber: 8033, archived: false },
    }),
  );
});
it("caps assignments at completed matches and counts distinct scouted matches", async () => {
  db.scouter.findMany.mockResolvedValue([
    {
      uuid: "s",
      name: "Scout",
      team1Shifts: [{ startMatchOrdinalNumber: 1, endMatchOrdinalNumber: 2 }],
      team2Shifts: [],
      team3Shifts: [],
      team4Shifts: [],
      team5Shifts: [],
      team6Shifts: [{ startMatchOrdinalNumber: 3, endMatchOrdinalNumber: 10 }],
    },
    {
      uuid: "extra",
      name: "Extra",
      team1Shifts: [],
      team2Shifts: [],
      team3Shifts: [],
      team4Shifts: [],
      team5Shifts: [],
      team6Shifts: [],
    },
  ]);
  const result = await invoke(scoutingLeadProgressPage, {
    query: { tournamentKey: "2026test", archived: "true" },
  });
  expect(result.body).toEqual([
    {
      scouterUuid: "s",
      scouterName: "Scout",
      matchesScouted: 1,
      missedMatches: 3,
    },
    {
      scouterUuid: "extra",
      scouterName: "Extra",
      matchesScouted: 1,
      missedMatches: 0,
    },
  ]);
  expect(db.scoutReport.groupBy).toHaveBeenCalledWith({
    by: ["teamMatchKey"],
    where: { scouterUuid: "s", teamMatchData: { tournamentKey: "2026test" } },
  });
});
it("reports failed progress queries", async () => {
  db.scouter.findMany.mockRejectedValue(new Error("database"));
  expect((await invoke(scoutingLeadProgressPage)).statusCode).toBe(500);
});
it("reports an email provider's structured rejection", async () => {
  db.send.mockResolvedValue({ data: null, error: { message: "rejected" } });
  expect(
    (await invoke(emailTeamCode, { query: { teamNumber: "8033" } })).statusCode,
  ).toBe(500);
});
