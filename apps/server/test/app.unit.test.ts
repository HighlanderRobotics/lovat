import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import express from "express";
import { createHmac } from "node:crypto";

vi.mock("../src/prismaClient.js", () => ({
  default: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    tournament: { findMany: vi.fn().mockResolvedValue([]) },
    registeredTeam: { findUnique: vi.fn().mockResolvedValue({ number: 8033 }) },
  },
}));

vi.mock("../src/redisClient.js", () => ({
  kv: {
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

// requireAuth constructs the Auth0 JWKS URL while routes are imported.
process.env.AUTH0_DOMAIN = "auth.test.invalid";
process.env.LOVAT_SIGNING_KEY = "synthetic-test-signing-key";
process.env.DOTENV_CONFIG_PATH = "/dev/null";
process.env.DATABASE_URL =
  "postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test";
process.env.SLACK_VERIFICATION_KEY = "synthetic-slack-verification-key";

const { app } = await import("../src/app.js");
const { default: requireLovatSignature } =
  await import("../src/lib/middleware/requireLovatSignature.js");
const { checkForInvalidEvents, removeOrphanedStartEvents } =
  await import("../src/handler/manager/scoutreports/addScoutReport.js");
const { kv } = await import("../src/redisClient.js");

describe("Server HTTP routes", () => {
  it("reports a healthy process without starting the background scheduler", async () => {
    const response = await request(app).get("/status");
    expect(response.status).toBe(200);
    expect(response.text).toBe("Server running");
  });

  it("rejects a protected report read without a token", async () => {
    const response = await request(app).get(
      "/v1/manager/scoutreports/test-report",
    );
    expect(response.status).toBe(401);
    expect(response.text).toBe("No authorization token provided");
    expect(response.headers.ratelimit).toBeDefined();
  });

  it("allows configured browser origins and rejects unrelated origins", async () => {
    const trusted = await request(app)
      .get("/status")
      .set("Origin", "https://dashboard.lovat.app");
    const untrusted = await request(app)
      .get("/status")
      .set("Origin", "https://attacker.invalid");
    expect(trusted.headers["access-control-allow-origin"]).toBe(
      "https://dashboard.lovat.app",
    );
    expect(untrusted.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("requires Slack's verification token before returning a JSON challenge", async () => {
    const challenge = "<script>alert(1)</script>";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const withoutToken = await request(app)
      .post("/v1/slack/event")
      .set("x-slack-signature", "v0=synthetic")
      .set("x-slack-request-timestamp", timestamp)
      .send({ challenge });
    expect(withoutToken.status).toBe(401);

    const verified = await request(app)
      .post("/v1/slack/event")
      .set("x-slack-signature", "v0=synthetic")
      .set("x-slack-request-timestamp", timestamp)
      .send({ token: process.env.SLACK_VERIFICATION_KEY, challenge });
    expect(verified.status).toBe(200);
    expect(verified.headers["content-type"]).toContain("application/json");
    expect(verified.body).toEqual({ challenge });
  });

  it("creates a one-time Slack OAuth state and rejects unknown states", async () => {
    const invite = await request(app).get(
      "/v1/slack-invite?team_code=test-team",
    );
    expect(invite.status).toBe(302);
    const state = new URL(invite.headers.location).searchParams.get("state");
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(kv.setEx).toHaveBeenCalledWith(
      `slack:oauth:${state}`,
      "test-team",
      600,
    );

    const callback = await request(app).get(
      `/v1/slack/add-workspace?code=synthetic&state=${state}`,
    );
    expect(callback.status).toBe(400);
    expect(callback.text).toBe("Invalid or expired OAuth state");
  });

  it("rejects malformed report uploads before touching the database", async () => {
    const response = await request(app)
      .post("/v1/manager/scoutreports")
      .send({ uuid: "test-report", events: [] });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

describe("signed Website requests", () => {
  const signedApp = express();
  signedApp.use(express.json());
  signedApp.post("/signed", requireLovatSignature, (_req, res) => {
    res.sendStatus(204);
  });

  const sign = (timestamp: number, body: object = {}) =>
    createHmac("sha256", process.env.LOVAT_SIGNING_KEY!)
      .update(
        JSON.stringify({
          path: "/signed",
          method: "POST",
          body: Object.keys(body).length ? JSON.stringify(body) : "",
          timestamp,
        }),
      )
      .digest("hex");

  it("accepts a current matching signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await request(signedApp)
      .post("/signed")
      .send({})
      .set("x-timestamp", String(timestamp))
      .set("x-signature", sign(timestamp));
    expect(response.status).toBe(204);
  });

  it("rejects a changed signature and stale or future timestamps", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const changed = await request(signedApp)
        .post("/signed")
        .send({})
        .set("x-timestamp", String(timestamp))
        .set("x-signature", sign(timestamp, { changed: true }));
      expect(changed.status).toBe(403);

      for (const offset of [-360, 360]) {
        const shifted = timestamp + offset;
        const response = await request(signedApp)
          .post("/signed")
          .send({})
          .set("x-timestamp", String(shifted))
          .set("x-signature", sign(shifted));
        expect(response.status).toBe(401);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects signatures copied to a different body or request path", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const originalSignature = sign(timestamp, { action: "approve" });
    const changedBody = await request(signedApp)
      .post("/signed")
      .send({ action: "reject" })
      .set("x-timestamp", String(timestamp))
      .set("x-signature", originalSignature);
    expect(changedBody.status).toBe(403);

    const changedPath = await request(signedApp)
      .post("/signed?replayed=1")
      .send({ action: "approve" })
      .set("x-timestamp", String(timestamp))
      .set("x-signature", originalSignature);
    expect(changedPath.status).toBe(403);
  });
});

describe("report event validation", () => {
  it("accepts a matched scoring interval", () => {
    expect(
      checkForInvalidEvents([
        [0, 2, 8],
        [10, 0, 2],
        [20, 1, 2, 3],
      ]),
    ).toBeNull();
  });

  it("rejects unfinished, overlapping, and unknown actions", () => {
    expect(checkForInvalidEvents([[10, 0, 2]])).toContain(
      "Invalid input. Missing stop event for SCORING event.",
    );
    expect(
      checkForInvalidEvents([
        [10, 0, 2],
        [15, 3, 2],
        [20, 1, 2],
      ]),
    ).toContain(
      "Invalid input. Cannot start CAMPING event while in SCORING event.",
    );
    expect(checkForInvalidEvents([[10, 99, 2]])).toContain(
      "Invalid event action 99.",
    );
  });

  it("removes orphaned start actions only for affected app versions", () => {
    const events = [
      [0, 2, 8],
      [10, 0, 2],
      [15, 3, 2],
      [20, 4, 2],
    ];
    expect(removeOrphanedStartEvents(events, "26.0.3")).toEqual([
      events[0],
      events[2],
      events[3],
    ]);
    expect(removeOrphanedStartEvents(events, "26.0.5")).toEqual(events);
  });
});
