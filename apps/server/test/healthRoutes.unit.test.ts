import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pingRedis: vi.fn(),
  queryPostgres: vi.fn(),
  analytics: vi.fn(),
}));
vi.mock("../src/redisClient.js", () => ({ pingRedis: mocks.pingRedis }));
vi.mock("../src/prismaClient.js", () => ({
  default: { $queryRaw: mocks.queryPostgres },
}));
vi.mock("../src/lib/middleware/posthogMiddleware.js", () => ({
  default: (_req: Request, _res: Response, next: NextFunction) => {
    mocks.analytics();
    next();
  },
}));
vi.mock("../src/lib/middleware/errorReporter.js", () => ({
  errorReporter: vi.fn(),
}));
vi.mock("../src/routes/index.js", () => ({
  default: (_req: Request, res: Response) => res.json({ ok: true }),
}));
vi.mock("../src/routes/collection/collection.routes.js", () => ({
  default: (_req: Request, res: Response) => res.json({ ok: true }),
}));
const { app } = await import("../src/app.js");
const { runtimeHealth } = await import("../src/lib/runtimeHealth.js");

beforeEach(() => {
  vi.resetAllMocks();
  runtimeHealth.stop();
  mocks.pingRedis.mockResolvedValue("PONG");
  mocks.queryPostgres.mockRejectedValue(new Error("PostgreSQL unavailable"));
});

it("answers liveness without touching dependencies, parsing or telemetry", async () => {
  const response = await request(app)
    .get("/live")
    .set("Content-Type", "application/json")
    .send("invalid-json");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: "live" });
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(mocks.pingRedis).not.toHaveBeenCalled();
  expect(mocks.queryPostgres).not.toHaveBeenCalled();
  expect(mocks.analytics).not.toHaveBeenCalled();
});

it.each([true, false])(
  "returns a minimal, uncached readiness result (%s)",
  async (ready) => {
    runtimeHealth.start();
    if (!ready) {
      mocks.pingRedis.mockRejectedValue(new Error("Redis unavailable"));
    }
    const response = await request(app).get("/ready");
    expect(response.status).toBe(ready ? 200 : 503);
    expect(response.body).toEqual({ status: ready ? "ready" : "not_ready" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.queryPostgres).not.toHaveBeenCalled();
    expect(mocks.analytics).not.toHaveBeenCalled();
  },
);

it("reuses a ready Redis probe across requests without consulting offline PostgreSQL", async () => {
  runtimeHealth.start();
  const responses = await Promise.all([
    request(app).get("/ready"),
    request(app).get("/ready"),
    request(app).get("/ready"),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  expect(mocks.pingRedis).toHaveBeenCalledOnce();
  expect(mocks.queryPostgres).not.toHaveBeenCalled();
});

it("rejects subsequent requests on draining connections while liveness stays available", async () => {
  const response = await request(app).get("/v1/private-report");
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ status: "not_ready" });
  expect(response.headers.connection).toBe("close");
  expect(mocks.analytics).not.toHaveBeenCalled();
  expect((await request(app).get("/live")).status).toBe(200);
  expect((await request(app).get("/ready")).status).toBe(503);
  expect(mocks.pingRedis).not.toHaveBeenCalled();
});

it("preserves the legacy status response for existing callers", async () => {
  runtimeHealth.start();
  const response = await request(app).get("/status");
  expect(response.status).toBe(200);
  expect(response.text).toBe("Server running");
});
