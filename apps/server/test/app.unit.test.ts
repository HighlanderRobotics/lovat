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
  await import("../src/handler/collection/addScoutReport.js");
const { kv } = await import("../src/redisClient.js");

describe("Server HTTP routes", () => {
  it("mounts the v2 scout list alongside its v1 route", async () => {
    const v1 = await request(app)
      .get("/v1/manager/scouters")
      .set("X-Lovat-Error-Format", "json-v1");
    const v2 = await request(app)
      .get("/v2/collection/scouter")
      .set("X-Lovat-Error-Format", "json-v1");
    expect(v1.status).toBe(400);
    expect(v2.status).toBe(v1.status);
    expect(v2.body).toEqual(v1.body);
  });

  it("registers pre-match loading and validates requests before database access", async () => {
    const response = await request(app)
      .post("/v2/collection/load/2026test_qm1/254")
      .set("X-Lovat-Error-Format", "json-v1")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.displayError).toBe(
      "Invalid input. Make sure you are using the correct input.",
    );
    expect(response.headers.ratelimit).toBeDefined();
  });

  it.each(["start", "end", "submit"])(
    "registers the Collection %s endpoint",
    async (path) => {
      const response = await request(app)
        .post(`/v2/collection/${path}`)
        .set("X-Lovat-Error-Format", "json-v1")
        .send({});
      expect(response.status).toBe(400);
      expect(response.headers.ratelimit).toBeDefined();
    },
  );

  it.each([
    ["/collection/checkcode", "/v1/manager/scouter/checkcode"],
    ["/collection/scouter", "/v1/manager/scouters"],
    ["/collection/tournament", "/v1/manager/scouters/test/tournaments"],
    ["/collection/schedules/test", "/v1/manager/scouterschedules/test"],
  ])("keeps %s compatible with %s", async (current, legacy) => {
    const before = await request(app)
      .get(legacy)
      .set("X-Lovat-Error-Format", "json-v1");
    const after = await request(app)
      .get(current)
      .set("X-Lovat-Error-Format", "json-v1");
    expect(after.status).toBe(before.status);
    expect(after.body).toEqual(before.body);
    expect(after.headers.ratelimit).toBeDefined();
  });

  it.each(["load", "start", "end", "submit", "scoutreports"])(
    "mounts /collection/%s alongside the v2 alias",
    async (path) => {
      const current = await request(app)
        .post(`/collection/${path}`)
        .set("X-Lovat-Error-Format", "json-v1")
        .send({});
      const alias = await request(app)
        .post(`/v2/collection/${path}`)
        .set("X-Lovat-Error-Format", "json-v1")
        .send({});
      expect(current.status).toBe(400);
      expect(alias.status).toBe(current.status);
      expect(alias.body).toEqual(current.body);
    },
  );

  it("reports a healthy process without starting the background scheduler", async () => {
    const response = await request(app)
      .get("/status")
      .set("X-Lovat-Error-Format", "json-v1");
    expect(response.status).toBe(200);
    expect(response.text).toBe("Server running");
  });

  it("rejects a protected report read without a token", async () => {
    const response = await request(app)
      .get("/v1/manager/scoutreports/test-report")
      .set("X-Lovat-Error-Format", "json-v1");
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      displayError: "No authorization token provided",
    });
    expect(response.headers.ratelimit).toBeDefined();
  });

  it("rejects report flagging without a token", async () => {
    const response = await request(app)
      .post("/v1/manager/scoutreports/setflag/test-report")
      .set("X-Lovat-Error-Format", "json-v1")
      .query({ flag: "true" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      displayError: "No authorization token provided",
    });
  });

  it("allows configured browser origins and rejects unrelated origins", async () => {
    const trusted = await request(app)
      .get("/status")
      .set("X-Lovat-Error-Format", "json-v1")
      .set("Origin", "https://dashboard.lovat.app");
    const untrusted = await request(app)
      .get("/status")
      .set("X-Lovat-Error-Format", "json-v1")
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
      .set("X-Lovat-Error-Format", "json-v1")
      .set("x-slack-signature", "v0=synthetic")
      .set("x-slack-request-timestamp", timestamp)
      .send({ challenge });
    expect(withoutToken.status).toBe(401);

    const verified = await request(app)
      .post("/v1/slack/event")
      .set("X-Lovat-Error-Format", "json-v1")
      .set("x-slack-signature", "v0=synthetic")
      .set("x-slack-request-timestamp", timestamp)
      .send({ token: process.env.SLACK_VERIFICATION_KEY, challenge });
    expect(verified.status).toBe(200);
    expect(verified.headers["content-type"]).toContain("application/json");
    expect(verified.body).toEqual({ challenge });
  });

  it("creates a one-time Slack OAuth state and rejects unknown states", async () => {
    const invite = await request(app)
      .get("/v1/slack-invite?team_code=test-team")
      .set("X-Lovat-Error-Format", "json-v1");
    expect(invite.status).toBe(302);
    const state = new URL(invite.headers.location).searchParams.get("state");
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(kv.setEx).toHaveBeenCalledWith(
      `slack:oauth:${state}`,
      "test-team",
      600,
    );

    const callback = await request(app)
      .get(`/v1/slack/add-workspace?code=synthetic&state=${state}`)
      .set("X-Lovat-Error-Format", "json-v1");
    expect(callback.status).toBe(400);
    expect(callback.body).toMatchObject({
      code: "BAD_REQUEST",
      displayError: "Invalid or expired OAuth state",
    });
  });

  it("rejects malformed report uploads before touching the database", async () => {
    const response = await request(app)
      .post("/v1/manager/scoutreports")
      .set("X-Lovat-Error-Format", "json-v1")
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
      .set("X-Lovat-Error-Format", "json-v1")
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
        .set("X-Lovat-Error-Format", "json-v1")
        .send({})
        .set("x-timestamp", String(timestamp))
        .set("x-signature", sign(timestamp, { changed: true }));
      expect(changed.status).toBe(403);

      for (const offset of [-360, 360]) {
        const shifted = timestamp + offset;
        const response = await request(signedApp)
          .post("/signed")
          .set("X-Lovat-Error-Format", "json-v1")
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
      .set("X-Lovat-Error-Format", "json-v1")
      .send({ action: "reject" })
      .set("x-timestamp", String(timestamp))
      .set("x-signature", originalSignature);
    expect(changedBody.status).toBe(403);

    const changedPath = await request(signedApp)
      .post("/signed?replayed=1")
      .set("X-Lovat-Error-Format", "json-v1")
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
it("serves fresh OpenAPI documents and permits localhost origins in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.resetModules();
  try {
    const { app: developmentApp } = await import("../src/app.js");
    const result = await request(developmentApp)
      .get("/v1/doc.json")
      .set("X-Lovat-Error-Format", "json-v1")
      .set("Origin", "http://localhost:3000");
    expect(result.status).toBe(200);
    expect(result.body.openapi).toBe("3.1.0");
    expect(result.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    vi.stubEnv("BASE_URL", "https://api.test.invalid");
    const { generateOpenApiDocument } = await import("../src/lib/openapi.js");
    expect(generateOpenApiDocument().servers).toEqual([
      { url: "https://api.test.invalid" },
    ]);
    vi.stubEnv("BASE_URL", undefined);
    expect(generateOpenApiDocument().servers).toEqual([
      { url: "https://api.lovat.app" },
    ]);
  } finally {
    vi.unstubAllEnvs();
  }
});
it("serves the production OpenAPI document", async () => {
  const result = await request(app)
    .get("/v1/doc.json")
    .set("X-Lovat-Error-Format", "json-v1");
  expect(result.status).toBe(200);
  expect(result.body.openapi).toBe("3.1.0");
  expect(result.body.components.schemas.ApiError).toMatchObject({
    type: "object",
    required: ["code", "message", "displayError"],
    properties: {
      invalidFields: { type: "array", items: { type: "string" } },
      retryAfterSeconds: { type: "number" },
    },
  });
  expect(
    result.body.paths["/status"].get.responses["200"].content,
  ).toHaveProperty("text/plain");
});

it("documents the shared error schema for every registered operation without replacing success responses", async () => {
  const { generateOpenApiDocument, ApiErrorSchema } =
    await import("../src/lib/openapi.js");
  const { AppError, errorBody } = await import("../src/lib/errors.js");
  const document = generateOpenApiDocument();
  const content = {
    "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
  };
  let errors = 0;
  for (const path of Object.values(document.paths ?? {})) {
    if (!path) {
      continue;
    }
    for (const method of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
      "trace",
    ] as const) {
      const operation = path[method];
      if (!operation) {
        continue;
      }
      expect(operation.responses?.default).toEqual({
        $ref: "#/components/responses/ApiErrorResponse",
      });
      for (const [status, response] of Object.entries(
        operation.responses ?? {},
      )) {
        if (/^[45]\d{2}$/.test(status) && response && !("$ref" in response)) {
          expect(response.content).toEqual(content);
          errors++;
        }
      }
    }
  }
  expect(errors).toBeGreaterThan(0);
  const body = errorBody(
    new AppError("Wait before retrying", 429, "RATE_LIMITED", {
      retryAfterSeconds: 3,
      invalidFields: ["code"],
    }),
  );
  expect(ApiErrorSchema.parse(body)).toEqual(body);
});

it("returns the shared not-found contract for an unknown route", async () => {
  const response = await request(app)
    .get("/definitely-not-a-route")
    .set("X-Lovat-Error-Format", "json-v1");
  expect(response.status).toBe(404);
  expect(response.body).toMatchObject({
    code: "NOT_FOUND",
    message: "Route not found",
  });
});
