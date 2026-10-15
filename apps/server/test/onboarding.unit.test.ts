import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@lovat/db";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  user: { update: vi.fn() },
  registeredTeam: { findUnique: vi.fn(), update: vi.fn() },
  emailVerificationRequest: { findUnique: vi.fn(), create: vi.fn() },
  set: vi.fn(),
  send: vi.fn(),
  slack: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({ kv: { set: db.set } }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: db.send };
  },
}));
vi.mock("../src/handler/manager/sendSlackVerification.js", () => ({
  sendSlackVerification: db.slack,
}));
import { addUsername } from "../src/handler/manager/onboarding/addUsername.js";
import { addWebsite } from "../src/handler/manager/onboarding/addWebsite.js";
import { checkCode } from "../src/handler/manager/onboarding/checkCode.js";
import { approveTeamEmail } from "../src/handler/manager/onboarding/approveTeamEmail.js";
import {
  resendEmail,
  sendVerificationEmail,
} from "../src/handler/manager/onboarding/resendEmail.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T12:00:00Z"));
  vi.stubEnv("LOVAT_WEBSITE", "https://example.invalid");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.registeredTeam.findUnique.mockResolvedValue({
    number: 8033,
    email: "team@example.invalid",
    code: "join-code",
  });
  db.registeredTeam.update.mockResolvedValue({
    number: 8033,
    email: "team@example.invalid",
  });
  db.emailVerificationRequest.findUnique.mockResolvedValue({
    teamNumber: 8033,
    email: "verified@example.invalid",
    expiresAt: new Date(Date.now() + 1000),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
for (const handler of [addUsername, addWebsite, checkCode, resendEmail])
  it(`${handler.name} denies API-key mutations`, async () => {
    expect((await invoke(handler, { tokenType: "apiKey" })).statusCode).toBe(
      403,
    );
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
  });
it("sets only the authenticated user's username", async () => {
  expect(
    (await invoke(addUsername, { body: { username: "Scout" } })).statusCode,
  ).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: testUser.id },
    data: { username: "Scout" },
  });
});
it("reports username persistence errors", async () => {
  db.user.update.mockRejectedValue(new Error("offline"));
  expect(
    (await invoke(addUsername, { body: { username: "Scout" } })).statusCode,
  ).toBe(500);
});
it("updates the affiliated team website and requests Slack verification", async () => {
  expect(
    (
      await invoke(addWebsite, {
        body: { website: "https://team.example.invalid" },
      })
    ).statusCode,
  ).toBe(200);
  expect(db.registeredTeam.update).toHaveBeenCalledWith({
    where: { number: 8033 },
    data: { website: "https://team.example.invalid" },
  });
  expect(db.slack).toHaveBeenCalledWith(
    8033,
    "team@example.invalid",
    "https://team.example.invalid",
  );
});
it("rejects malformed website input", async () => {
  expect((await invoke(addWebsite, { body: { website: 42 } })).statusCode).toBe(
    400,
  );
  expect(db.registeredTeam.update).not.toHaveBeenCalled();
});
it("reports website write and Slack delivery failures", async () => {
  db.slack.mockRejectedValue(new Error("offline"));
  expect(
    (
      await invoke(addWebsite, {
        body: { website: "https://team.example.invalid" },
      })
    ).statusCode,
  ).toBe(500);
});
it("joins the requested team only for a matching code", async () => {
  expect(
    (await invoke(checkCode, { query: { team: "8033", code: "join-code" } }))
      .body,
  ).toBe(true);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: testUser.id },
    data: { teamNumber: 8033 },
  });
});
it("does not join a team with the wrong code", async () => {
  expect(
    (await invoke(checkCode, { query: { team: "8033", code: "wrong" } }))
      .statusCode,
  ).toBe(404);
  expect(db.user.update).not.toHaveBeenCalled();
});
it("reports unknown teams and invalid team numbers", async () => {
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(checkCode, { query: { team: "8033" } })).statusCode,
  ).toBe(404);
  expect(
    (await invoke(checkCode, { query: { team: "invalid" } })).statusCode,
  ).toBe(400);
});
it("reports team lookup failure", async () => {
  db.registeredTeam.findUnique.mockRejectedValue(new Error("offline"));
  expect(
    (await invoke(checkCode, { query: { team: "8033" } })).statusCode,
  ).toBe(500);
});
it("creates an expiring random verification code and emails its link", async () => {
  await sendVerificationEmail("team@example.invalid", 8033);
  const data = db.emailVerificationRequest.create.mock.calls[0][0].data;
  expect(data).toEqual({
    verificationCode: expect.stringMatching(/^[a-f0-9]{16}$/),
    email: "team@example.invalid",
    teamNumber: 8033,
    expiresAt: new Date("2026-03-12T12:20:00Z"),
  });
  expect(db.send).toHaveBeenCalledWith({
    from: "noreply@lovat.app",
    to: "team@example.invalid",
    subject: "Lovat Email Verification",
    html: expect.stringContaining(
      `https://example.invalid/verify/${data.verificationCode}`,
    ),
  });
});
it("resends verification to the registered team's email", async () => {
  expect((await invoke(resendEmail)).statusCode).toBe(200);
  await Promise.resolve();
  expect(db.emailVerificationRequest.create).toHaveBeenCalled();
  expect(db.send).toHaveBeenCalled();
});
it("denies resending for a teamless user", async () => {
  expect(
    (await invoke(resendEmail, { user: { ...testUser, teamNumber: null } }))
      .statusCode,
  ).toBe(403);
  expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
});
it("reports an unknown team on resend", async () => {
  db.registeredTeam.findUnique.mockResolvedValue(null);
  expect((await invoke(resendEmail)).statusCode).toBe(404);
});
it("reports failed resend lookup", async () => {
  db.registeredTeam.findUnique.mockRejectedValue(new Error("offline"));
  expect((await invoke(resendEmail)).statusCode).toBe(500);
});
it("approves an unexpired code case-insensitively and refreshes the auth cache", async () => {
  expect(
    (await invoke(approveTeamEmail, { body: { code: "ABCDEF" } })).statusCode,
  ).toBe(200);
  expect(db.emailVerificationRequest.findUnique).toHaveBeenCalledWith({
    where: { verificationCode: "abcdef" },
  });
  expect(db.registeredTeam.update).toHaveBeenCalledWith({
    where: { number: 8033 },
    data: { emailVerified: true, email: "verified@example.invalid" },
  });
  expect(db.set).toHaveBeenCalledWith("auth:team:8033", "verified");
});
it("does not approve unknown codes", async () => {
  db.emailVerificationRequest.findUnique.mockResolvedValue(null);
  expect(
    (await invoke(approveTeamEmail, { body: { code: "unknown" } })).statusCode,
  ).toBe(404);
  expect(db.registeredTeam.update).not.toHaveBeenCalled();
});
it.each([0, -1000])(
  "rejects expired verification codes (%s)",
  async (offset) => {
    db.emailVerificationRequest.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + offset),
    });
    expect(
      (await invoke(approveTeamEmail, { body: { code: "expired" } }))
        .statusCode,
    ).toBe(400);
    expect(db.registeredTeam.update).not.toHaveBeenCalled();
    expect(db.set).not.toHaveBeenCalled();
  },
);
it("rejects malformed approval requests", async () => {
  expect((await invoke(approveTeamEmail)).statusCode).toBe(400);
  expect(db.emailVerificationRequest.findUnique).not.toHaveBeenCalled();
});
it("maps missing persistence rows to an unrecognized code", async () => {
  db.registeredTeam.update.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "test",
    }),
  );
  expect(
    (await invoke(approveTeamEmail, { body: { code: "test" } })).statusCode,
  ).toBe(404);
});
it("reports approval infrastructure failures", async () => {
  db.set.mockRejectedValue(new Error("offline"));
  expect(
    (await invoke(approveTeamEmail, { body: { code: "test" } })).statusCode,
  ).toBe(500);
});
it("reports verification persistence errors instead of claiming an email was sent", async () => {
  db.emailVerificationRequest.create.mockRejectedValue(new Error("offline"));
  expect((await invoke(resendEmail)).statusCode).toBe(500);
  expect(db.send).not.toHaveBeenCalled();
});
it("reports email delivery rejection", async () => {
  db.send.mockRejectedValue(new Error("delivery failed"));
  expect((await invoke(resendEmail)).statusCode).toBe(500);
});
