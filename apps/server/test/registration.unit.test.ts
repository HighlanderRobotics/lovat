import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  user: { update: vi.fn() },
  registeredTeam: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  featureToggle: { findUnique: vi.fn() },
  send: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/manager/onboarding/resendEmail.js", () => ({
  sendVerificationEmail: db.send,
}));
import { addRegisteredTeam } from "../src/handler/manager/registeredteams/addRegisteredTeam.js";
import { approveRegisteredTeam } from "../src/handler/manager/registeredteams/approveRegisteredTeam.js";
import { rejectRegisteredTeam } from "../src/handler/manager/registeredteams/rejectRegisteredTeam.js";
import { checkRegisteredTeam } from "../src/handler/manager/registeredteams/checkRegisteredTeam.js";
const team = {
  number: 8033,
  email: "team@example.invalid",
  code: "CODE",
  website: "https://example.invalid",
  emailVerified: true,
  teamApproved: true,
  users: [{ id: testUser.id }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  db.registeredTeam.findUnique.mockResolvedValue(team);
  db.featureToggle.findUnique.mockResolvedValue({ enabled: true });
  db.registeredTeam.count.mockResolvedValue(0);
  db.registeredTeam.update.mockResolvedValue(team);
});
afterEach(() => vi.restoreAllMocks());
it.each([true, false])(
  "creates a team with the approval policy (%s)",
  async (enabled) => {
    db.featureToggle.findUnique.mockResolvedValue({ enabled });
    db.registeredTeam.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(
      (
        await invoke(addRegisteredTeam, {
          body: { email: team.email, number: 8033 },
        })
      ).statusCode,
    ).toBe(200);
    expect(db.registeredTeam.count).toHaveBeenCalledTimes(2);
    expect(db.registeredTeam.create).toHaveBeenCalledWith({
      data: {
        email: team.email,
        number: 8033,
        code: expect.stringMatching(/^[A-Z0-9]{6}$/),
        ...(enabled ? {} : { teamApproved: true }),
      },
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: testUser.id },
      data: { teamNumber: 8033, role: "SCOUTING_LEAD" },
    });
    expect(db.send).toHaveBeenCalledWith(team.email, 8033);
  },
);
it("denies registration with an API key", async () => {
  expect(
    (await invoke(addRegisteredTeam, { tokenType: "apiKey" })).statusCode,
  ).toBe(403);
  expect(db.registeredTeam.create).not.toHaveBeenCalled();
});
it("rejects malformed registration", async () => {
  expect(
    (
      await invoke(addRegisteredTeam, {
        body: { email: "invalid", number: 8033 },
      })
    ).statusCode,
  ).toBe(400);
  expect(db.registeredTeam.create).not.toHaveBeenCalled();
});
it("reports failed registration delivery", async () => {
  db.send.mockRejectedValue(new Error("offline"));
  expect(
    (
      await invoke(addRegisteredTeam, {
        body: { email: team.email, number: 8033 },
      })
    ).statusCode,
  ).toBe(500);
});
for (const handler of [
  approveRegisteredTeam,
  rejectRegisteredTeam,
  checkRegisteredTeam,
]) {
  it(`${handler.name} rejects invalid team input`, async () => {
    expect(
      (await invoke(handler, { params: { team: "invalid" } })).statusCode,
    ).toBe(400);
    expect(db.registeredTeam.update).not.toHaveBeenCalled();
    expect(db.registeredTeam.delete).not.toHaveBeenCalled();
    expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
  });
  it(`${handler.name} reports failed persistence`, async () => {
    db.registeredTeam.update.mockRejectedValue(new Error("offline"));
    db.registeredTeam.delete.mockRejectedValue(new Error("offline"));
    db.registeredTeam.findUnique.mockRejectedValue(new Error("offline"));
    expect(
      (await invoke(handler, { params: { team: "8033" } })).statusCode,
    ).toBe(500);
  });
}
it("approves the selected registration", async () => {
  expect(
    (await invoke(approveRegisteredTeam, { params: { team: "8033" } })).body,
  ).toEqual(team);
  expect(db.registeredTeam.update).toHaveBeenCalledWith({
    where: { number: 8033 },
    data: { teamApproved: true },
  });
});
it("removes the rejected registration", async () => {
  expect(
    (await invoke(rejectRegisteredTeam, { params: { team: "8033" } }))
      .statusCode,
  ).toBe(200);
  expect(db.registeredTeam.delete).toHaveBeenCalledWith({
    where: { number: 8033 },
  });
});
it("reports registration not started", async () => {
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(checkRegisteredTeam, { params: { team: "8033" } })).body,
  ).toEqual({ status: "NOT_STARTED" });
});
it.each([
  {
    changes: { emailVerified: false },
    enabled: true,
    caller: 8033,
    status: "PENDING_EMAIL_VERIFICATION",
    extra: { email: team.email },
  },
  {
    changes: { website: null },
    enabled: true,
    caller: 8033,
    status: "PENDING_WEBSITE",
    extra: {},
  },
  {
    changes: { teamApproved: false },
    enabled: true,
    caller: 8033,
    status: "PENDING_TEAM_VERIFICATION",
    extra: { teamEmail: team.email },
  },
  {
    changes: {},
    enabled: true,
    caller: 8033,
    status: "REGISTERED_ON_TEAM",
    extra: {},
  },
  {
    changes: {},
    enabled: true,
    caller: 254,
    status: "REGISTERED_OFF_TEAM",
    extra: {},
  },
  {
    changes: { website: null },
    enabled: false,
    caller: 8033,
    status: "REGISTERED_ON_TEAM",
    extra: {},
  },
  {
    changes: { users: [] },
    enabled: true,
    caller: 8033,
    status: "REGISTERED_ON_TEAM",
    extra: {},
  },
  {
    changes: { users: [{ id: "other" }] },
    enabled: true,
    caller: 254,
    status: "REGISTERED_OFF_TEAM",
    extra: {},
  },
  {
    changes: { users: [], emailVerified: false },
    enabled: true,
    caller: 8033,
    status: "PENDING",
    extra: {},
  },
  {
    changes: { users: [], teamApproved: false },
    enabled: true,
    caller: 8033,
    status: "PENDING",
    extra: {},
  },
])(
  "reports registration state $status ($changes)",
  async ({ changes, enabled, caller, status, extra }) => {
    db.registeredTeam.findUnique.mockResolvedValue({ ...team, ...changes });
    db.featureToggle.findUnique.mockResolvedValue({ enabled });
    expect(
      (
        await invoke(checkRegisteredTeam, {
          params: { team: "8033" },
          user: { ...testUser, teamNumber: caller },
        })
      ).body,
    ).toEqual({ status, ...extra });
  },
);
