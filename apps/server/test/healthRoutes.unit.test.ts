import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  ready: vi.fn(),
  stopping: vi.fn(),
  analytics: vi.fn(),
}));
vi.mock("../src/lib/runtimeHealth.js", () => ({
  runtimeHealth: {
    ready: mocks.ready,
    isStopping: mocks.stopping,
  },
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ready.mockResolvedValue(false);
  mocks.stopping.mockReturnValue(false);
});

it("answers liveness without touching dependencies, parsing or telemetry", async () => {
  const response = await request(app)
    .get("/live")
    .set("Content-Type", "application/json")
    .send("invalid-json");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: "live" });
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(mocks.ready).not.toHaveBeenCalled();
  expect(mocks.analytics).not.toHaveBeenCalled();
});

it.each([true, false])(
  "returns a minimal, uncached readiness result (%s)",
  async (ready) => {
    mocks.ready.mockResolvedValue(ready);
    const response = await request(app).get("/ready");
    expect(response.status).toBe(ready ? 200 : 503);
    expect(response.body).toEqual({ status: ready ? "ready" : "not_ready" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.analytics).not.toHaveBeenCalled();
  },
);

it("rejects subsequent requests on draining connections while liveness stays available", async () => {
  mocks.stopping.mockReturnValue(true);
  const response = await request(app).get("/v1/private-report");
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ status: "not_ready" });
  expect(response.headers.connection).toBe("close");
  expect(mocks.analytics).not.toHaveBeenCalled();
  expect((await request(app).get("/live")).status).toBe(200);
});

it("preserves the legacy status response for existing callers", async () => {
  const response = await request(app).get("/status");
  expect(response.status).toBe(200);
  expect(response.text).toBe("Server running");
});
