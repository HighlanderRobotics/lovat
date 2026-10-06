import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";
import { requireSlackToken } from "../src/lib/middleware/requireSlackToken.js";
const next = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-12T12:00:00Z"));
  vi.stubEnv("SLACK_VERIFICATION_KEY", "synthetic-token");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const now = () => String(Math.floor(Date.now() / 1000));
const slack = (
  body: unknown = { token: "synthetic-token" },
  headers: Record<string, string> = {
    "x-slack-signature": "synthetic-signature",
    "x-slack-request-timestamp": now(),
  },
) => invoke((req, res) => requireSlackToken(req, res, next), { body, headers });
it.each([{}, { "x-slack-signature": "sig" }])(
  "denies missing Slack headers (%j)",
  async (headers) => {
    expect((await slack({}, headers)).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  },
);
it.each(["abc", "0", String(1773316799)])(
  "denies stale or malformed Slack timestamps (%s)",
  async (timestamp) => {
    expect(
      (
        await slack(
          {},
          {
            "x-slack-signature": "sig",
            "x-slack-request-timestamp": timestamp,
          },
        )
      ).statusCode,
    ).toBe(401);
  },
);
it.each([{}, { token: 42 }, { token: "wrong" }])(
  "denies invalid Slack verification tokens (%j)",
  async (body) => {
    expect((await slack(body)).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  },
);
it("denies Slack requests if the verification key is unconfigured", async () => {
  vi.stubEnv("SLACK_VERIFICATION_KEY", "");
  expect((await slack()).statusCode).toBe(401);
});
it("answers string challenges without executing a command", async () => {
  expect(
    (await slack({ token: "synthetic-token", challenge: "challenge" })).body,
  ).toEqual({ challenge: "challenge" });
  expect(next).not.toHaveBeenCalled();
});
it("rejects malformed challenges", async () => {
  expect(
    (await slack({ token: "synthetic-token", challenge: 42 })).statusCode,
  ).toBe(400);
  expect(next).not.toHaveBeenCalled();
});
it("passes verified commands to the next middleware", async () => {
  await slack();
  expect(next).toHaveBeenCalledOnce();
});
it("reports unexpected command middleware failures", async () => {
  next.mockImplementation(() => {
    throw new Error("failure");
  });
  expect((await slack()).statusCode).toBe(500);
});
it.each([
  {},
  { "x-signature": "sig" },
  { "x-signature": "sig", "x-timestamp": "invalid" },
])(
  "denies missing or malformed website signature metadata (%j)",
  async (headers) => {
    vi.stubEnv("LOVAT_SIGNING_KEY", "synthetic-signing-key");
    vi.resetModules();
    const { default: requireSignature } =
      await import("../src/lib/middleware/requireLovatSignature.js");
    expect(
      (
        await invoke((req, res) => requireSignature(req, res, next), {
          headers,
          method: "POST",
          originalUrl: "/test",
        })
      ).statusCode,
    ).toBe(401);
    expect(next).not.toHaveBeenCalled();
  },
);
it.each([{}, { data: "payload" }])(
  "accepts current website signatures for empty and populated bodies (%j)",
  async (body) => {
    vi.stubEnv("LOVAT_SIGNING_KEY", "synthetic-signing-key");
    vi.resetModules();
    const { default: requireSignature } =
      await import("../src/lib/middleware/requireLovatSignature.js");
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "synthetic-signing-key")
      .update(
        JSON.stringify({
          path: "/test",
          method: "POST",
          body: JSON.stringify(body) === "{}" ? "" : JSON.stringify(body),
          timestamp,
        }),
      )
      .digest("hex");
    await invoke((req, res) => requireSignature(req, res, next), {
      body,
      method: "POST",
      originalUrl: "/test",
      headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
    });
    expect(next).toHaveBeenCalledOnce();
  },
);
