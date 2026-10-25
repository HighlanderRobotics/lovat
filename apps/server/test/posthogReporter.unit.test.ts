import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";
import { testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  scouter: { findUnique: vi.fn() },
  registeredTeam: { findUnique: vi.fn() },
  get: vi.fn(),
  setEx: vi.fn(),
  capture: vi.fn(),
  alias: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: db.get, setEx: db.setEx },
}));
vi.mock("../src/posthogClient.js", () => ({
  posthog: { capture: db.capture, alias: db.alias },
}));
import reporter from "../src/lib/middleware/posthogMiddleware.js";
const run = async (
  overrides: Record<string, unknown> = {},
  statusCode = 200,
  body: unknown = "ok",
) => {
  let finish: () => Promise<void> = async () => undefined;
  const req = {
    method: "POST",
    headers: {},
    ips: [],
    ip: "127.0.0.1",
    route: { path: "/reports" },
    baseUrl: "/v1/manager",
    originalUrl: "/v1/manager/reports",
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request | AuthenticatedRequest;
  const res = {
    statusCode,
    send: vi.fn(),
    once: vi.fn((_event: string, callback: () => Promise<void>) => {
      finish = callback;
    }),
    getHeader: vi.fn().mockReturnValue("MISS"),
  };
  const next = vi.fn();
  await reporter(req, res as unknown as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  res.send(body);
  await finish();
  return res;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  db.get.mockResolvedValue(null);
  db.scouter.findUnique.mockResolvedValue({
    uuid: "s",
    name: "Scout",
    sourceTeamNumber: 8033,
  });
  db.registeredTeam.findUnique.mockResolvedValue({ number: 8033 });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("captures authenticated responses with proxy IP, cache, and client headers", async () => {
  await run(
    {
      user: testUser,
      ips: ["192.0.2.1"],
      headers: {
        "x-app-version": ["26.0", "ignored"],
        "x-os-name": "test",
        "x-build-number": "10",
      },
      tokenType: "jwt",
    },
    400,
    '{"error":"bad"}',
  );
  expect(db.capture).toHaveBeenCalledWith(
    expect.objectContaining({
      distinctId: testUser.id,
      properties: expect.objectContaining({
        $ip: "192.0.2.1",
        appVersion: "26.0",
        appBuild: "10",
        authType: "jwt",
        resBody: { error: "bad" },
        cache: "MISS",
        $set: expect.objectContaining({ userType: "user", teamNumber: 8033 }),
      }),
    }),
  );
});
it.each(["plain error", { error: "bad" }])(
  "preserves non-JSON error payloads %j",
  async (body) => {
    await run({ user: testUser }, 500, body);
    expect(db.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ resBody: body }),
      }),
    );
  },
);
it.each([
  "/scouters/:uuid/tournaments",
  "/scouters",
  "/scouterschedules/:tournament",
])("skips successful polling responses for %s", async (path) => {
  await run({ user: testUser, method: "GET", route: { path } });
  expect(db.capture).not.toHaveBeenCalled();
});
it("captures polling failures and unknown routes", async () => {
  await run(
    { user: testUser, method: "GET", route: { path: "/scouters" } },
    500,
  );
  await run({ user: testUser, method: "GET", route: undefined });
  expect(db.capture).toHaveBeenCalledTimes(2);
});
it("aliases a device to its scouter once and caches the alias", async () => {
  await run({
    headers: {
      "x-scouter-uuid": "s",
      "x-team-code": "synthetic",
      "x-device-id": "device",
    },
  });
  expect(db.alias).toHaveBeenCalledWith({ distinctId: "device", alias: "s" });
  expect(db.setEx).toHaveBeenCalledWith("posthog:alias:device:s", "1", 2592000);
  expect(db.capture).toHaveBeenCalledWith(
    expect.objectContaining({
      distinctId: "s",
      properties: expect.objectContaining({
        $set: expect.objectContaining({
          userType: "scouter",
          teamNumber: 8033,
        }),
      }),
    }),
  );
});
it("does not alias a device again when its cache entry exists", async () => {
  db.get.mockResolvedValue("1");
  await run({ headers: { "x-scouter-uuid": "s", "x-device-id": "device" } });
  expect(db.alias).not.toHaveBeenCalled();
});
it("captures a scouter without a device identifier", async () => {
  await run({ headers: { "x-scouter-uuid": "s" } });
  expect(db.capture).toHaveBeenCalledWith(
    expect.objectContaining({ distinctId: "s" }),
  );
});
it.each([
  [
    { "x-team-code": "synthetic", "x-device-id": "device" },
    "127.0.0.1",
    "device",
  ],
  [{ "x-team-code": "synthetic" }, "127.0.0.1", "scouter:ip:127.0.0.1"],
  [{ "x-team-code": "synthetic" }, undefined, "scouter:unknown"],
])(
  "falls back to team-code identity when no scouter is present %j",
  async (headers, ip, distinctId) => {
    await run({ headers, ip });
    expect(db.capture).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId }),
    );
  },
);
it("falls back to a team code when the scouter was deleted", async () => {
  db.scouter.findUnique.mockResolvedValue(null);
  db.registeredTeam.findUnique.mockResolvedValue(null);
  await run({
    headers: { "x-scouter-uuid": "deleted", "x-team-code": "synthetic" },
  });
  expect(db.capture).toHaveBeenCalledWith(
    expect.objectContaining({
      properties: expect.objectContaining({
        $set: expect.objectContaining({ teamNumber: undefined }),
      }),
    }),
  );
});
it("skips scouter polling responses", async () => {
  await run({
    method: "GET",
    route: { path: "/scouters" },
    headers: { "x-scouter-uuid": "s" },
  });
  expect(db.capture).not.toHaveBeenCalled();
});
it("keeps anonymous requests working after identity lookup fails", async () => {
  db.scouter.findUnique.mockRejectedValue(new Error("database"));
  await run({ headers: { "x-scouter-uuid": "s" } });
  expect(db.capture).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalled();
});
it("logs development requests even without an analytics identity", async () => {
  vi.stubEnv("NODE_ENV", "development");
  await run();
  expect(console.log).toHaveBeenCalledWith(
    "%s %s: %d ms, HTTP %d",
    "POST",
    "/v1/manager/reports",
    expect.any(Number),
    200,
  );
});
