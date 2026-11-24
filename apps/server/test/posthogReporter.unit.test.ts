import express, { Router } from "express";
import type { ErrorRequestHandler } from "express";
import request from "supertest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  alias: vi.fn(),
  findUnique: vi.fn(),
  get: vi.fn(),
  setEx: vi.fn(),
}));
vi.mock("../src/posthogClient.js", () => ({
  posthog: { capture: mocks.capture, alias: mocks.alias },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    scouter: { findUnique: mocks.findUnique },
    registeredTeam: { findUnique: mocks.findUnique },
  },
}));
vi.mock("../src/redisClient.js", () => ({ kv: mocks }));
import reporter from "../src/lib/middleware/posthogMiddleware.js";

const secret = "private-password-api-key-token-team-code-email-scouting-note";
const callerId = "auth0|000000000000000000000001";
const app = express();
app.use(express.json());
app.use(reporter);
app.get("/status", (_req, res) => res.send("ok"));
const manager = Router();
manager.all("/reports/:uuid", (req, res) => {
  const tokenType = {
    "Bearer test-verified-jwt": "jwt",
    "Bearer test-verified-key": "apiKey",
  }[req.headers.authorization ?? ""];
  if (tokenType) {
    // Simulate requireAuth succeeding after the reporter installs its listener.
    Object.assign(req, {
      tokenType,
      user: {
        id: callerId,
        username: secret,
        email: secret,
        teamNumber: 8033,
        role: "SCOUTING_LEAD",
      },
    });
  }
  res.set("X-Lovat-Cache", "miss");
  res.status(Number(req.query.status) || 200).json({ error: secret });
});
manager.get("/failure/:uuid", () => {
  throw new Error(secret);
});
manager.get("/cache/:value", (req, res) => {
  res.set("X-Lovat-Cache", req.params.value).send("ok");
});
app.use("/v1/manager", manager);
const dynamic = Router();
dynamic.get("/reports/:uuid", (_req, res) => res.send("ok"));
dynamic.get("/failure/:uuid", () => {
  throw new Error(secret);
});
manager.use("/private/:tenant", dynamic);
app.use("/private/:tenant", dynamic);
app.use((_req, res) => res.status(404).send(secret));
const errors: ErrorRequestHandler = (_error, _req, res, _next) => {
  res.status(500).json({ error: secret });
};
app.use(errors);

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([200, 400, 401, 403, 500])(
  "captures only anonymous operational fields for HTTP %s",
  async (status) => {
    vi.stubEnv("RAILWAY_DEPLOYMENT_ID", "deployment-123");
    vi.stubEnv("RAILWAY_REPLICA_ID", "replica-123");
    vi.stubEnv(
      "RAILWAY_GIT_COMMIT_SHA",
      "1234567890123456789012345678901234567890",
    );
    const response = await request(app)
      .post(`/v1/manager/reports/${secret}?status=${status}&token=${secret}`)
      .set("Authorization", `Bearer ${secret}`)
      .set("X-Team-Code", secret)
      .set("X-Scouter-Uuid", secret)
      .set("X-Device-Id", secret)
      .set("X-Request-Id", secret)
      .set("X-App-Version", secret)
      .set("X-Os-Name", secret)
      .set("X-Build-Number", secret)
      .send({ password: secret, apiKey: secret, privateReport: secret });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: secret });
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith({
      distinctId: "lovat-server",
      event: "response",
      timestamp: expect.any(Date),
      disableGeoip: true,
      properties: {
        $process_person_profile: false,
        service: "server",
        environment: expect.any(String),
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        railwayDeployment: "deployment-123",
        railwayReplica: "replica-123",
        gitCommit: "1234567890123456789012345678901234567890",
        method: "POST",
        route: "/v1/manager/reports/:uuid",
        $pathname: "/v1/manager/reports/:uuid",
        userType: undefined,
        authType: undefined,
        teamNumber: undefined,
        role: undefined,
        $set: undefined,
        appVersion: undefined,
        appBuild: undefined,
        $os_name: undefined,
        statusCode: status,
        errorCode:
          status >= 500
            ? "SERVER_ERROR"
            : status >= 400
              ? "REQUEST_ERROR"
              : undefined,
        responseTime: expect.any(Number),
        cache: "miss",
      },
    });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(secret);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.setEx).not.toHaveBeenCalled();
    expect(mocks.alias).not.toHaveBeenCalled();
  },
);

it.each([
  ["jwt", "Bearer test-verified-jwt"],
  ["apiKey", "Bearer test-verified-key"],
])(
  "uses the authenticated %s caller without capturing private fields",
  async (authType, authorization) => {
    const response = await request(app)
      .post(`/v1/manager/reports/${secret}?status=400&code=${secret}`)
      .set("Authorization", authorization)
      .set("X-Team-Code", secret)
      .set("X-Scouter-Uuid", secret)
      .set("X-Device-Id", secret)
      .set("X-App-Version", "26.0.4")
      .set("X-Build-Number", "33")
      .set("X-Operating-System", "web")
      .send({ password: secret, privateReport: secret });

    expect(response.status).toBe(400);
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        distinctId: callerId,
        disableGeoip: true,
        properties: expect.objectContaining({
          $process_person_profile: true,
          route: "/v1/manager/reports/:uuid",
          $pathname: "/v1/manager/reports/:uuid",
          userType: "user",
          authType,
          teamNumber: 8033,
          role: "SCOUTING_LEAD",
          $set: {
            userType: "user",
            teamNumber: 8033,
            role: "SCOUTING_LEAD",
          },
          appVersion: "26.0.4",
          appBuild: "33",
          $os_name: "web",
        }),
      }),
    );
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(
      authorization,
    );
    expect(mocks.alias).not.toHaveBeenCalled();
  },
);

it("keeps Collection-style requests anonymous and rejects code-shaped build hints", async () => {
  const teamCode = "012345";
  await request(app)
    .get(`/status?code=${teamCode}`)
    .set("X-Team-Code", teamCode)
    .set("X-Scouter-Uuid", "eafd426c-1d70-4d38-8994-912dd9671246")
    .set("X-Device-Id", "cabbcaf6-161c-42e1-917d-d3f046dc3a59")
    .set("X-App-Version", "26.1.0")
    .set("X-Build-Number", teamCode)
    .set("X-Os-Name", "android");

  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      distinctId: "lovat-server",
      properties: expect.objectContaining({
        $process_person_profile: false,
        appVersion: "26.1.0",
        appBuild: undefined,
        $os_name: "android",
      }),
    }),
  );
  expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(teamCode);
});

it.each([
  `/missing/${secret}?token=${secret}`,
  `/private/${secret}/reports/${secret}`,
])(
  "never falls back to raw paths or dynamic mount values: %s",
  async (path) => {
    await request(app).get(path);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          route: "unmatched",
          $pathname: undefined,
        }),
      }),
    );
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(secret);
  },
);

it("counts anonymous requests with stable routes and independent request IDs", async () => {
  await request(app).get("/v1/manager/reports/one");
  await request(app).get("/v1/manager/reports/two");
  const events = mocks.capture.mock.calls.map(([event]) => event);
  expect(events).toHaveLength(2);
  expect(events[0].properties.route).toBe(events[1].properties.route);
  expect(events[0].properties.requestId).not.toBe(
    events[1].properties.requestId,
  );
});

it.each(["hit", "miss", secret])(
  "allowlists cache status %s",
  async (value) => {
    await request(app).get(`/v1/manager/cache/${value}`);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          cache: value === secret ? "unknown" : value,
        }),
      }),
    );
  },
);

it("keeps responses working and logs no SDK details when capture fails", async () => {
  mocks.capture.mockImplementation(() => {
    throw new Error(secret);
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const response = await request(app).get("/v1/manager/reports/one");
  expect(response.status).toBe(200);
  expect(log).toHaveBeenCalledExactlyOnceWith("Request analytics failed");
  expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
});

it("counts literal root routes without query values", async () => {
  await request(app).get(`/status?token=${secret}`);
  expect(mocks.capture).toHaveBeenCalledWith(
    expect.objectContaining({
      properties: expect.objectContaining({ route: "/status" }),
    }),
  );
  expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(secret);
});

it.each([
  `/v1/manager/failure/${secret}`,
  `/private/${secret}/failure/${secret}`,
  `/v1/manager/private/${secret}/failure/${secret}`,
])("keeps an unwound router unmatched: %s", async (path) => {
  const response = await request(app).get(path);
  expect(response.status).toBe(500);
  expect(mocks.capture).toHaveBeenCalledWith(
    expect.objectContaining({
      properties: expect.objectContaining({
        route: "unmatched",
        statusCode: 500,
      }),
    }),
  );
  expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(secret);
});

it("groups methods outside the telemetry allowlist without copying them", async () => {
  await request(app).trace("/v1/manager/reports/one");
  expect(mocks.capture).toHaveBeenCalledWith(
    expect.objectContaining({
      properties: expect.objectContaining({ method: "OTHER" }),
    }),
  );
});
