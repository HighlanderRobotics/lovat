import express, { Router } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { createCairnReporter } from "../src/lib/cairn.js";
import { installCairnShutdown } from "../src/lib/cairnShutdown.js";
const env = {
  CAIRN_ENABLED: "true",
  CAIRN_URL: "https://cairn.example",
  CAIRN_INGESTION_TOKEN: "fake-test-ingestion",
  NODE_ENV: "production",
  RAILWAY_DEPLOYMENT_ID: "release-test",
  npm_package_version: "26.0.0",
};
afterEach(() => vi.restoreAllMocks());
describe("Cairn request reporting", () => {
  it("is inert by default", async () => {
    const send = vi.fn();
    const sdk = createCairnReporter({}, send);
    const app = express();
    app.use(sdk.middleware);
    app.get("/", (_req, res) => res.send("ok"));
    const response = await request(app).get("/");
    expect(response.headers["x-cairn-request-id"]).toBeUndefined();
    await sdk.flush();
    await sdk.shutdown();
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    { CAIRN_URL: undefined },
    { CAIRN_URL: "invalid" },
    { CAIRN_URL: "http://cairn.example" },
    { CAIRN_URL: "https://user:password@cairn.example" },
    { CAIRN_URL: "https://cairn.example/path" },
    { CAIRN_URL: "https://cairn.example?secret=private" },
    { CAIRN_URL: "https://cairn.example#private" },
    { CAIRN_INGESTION_TOKEN: "" },
    { CAIRN_ENVIRONMENT: "invalid environment" },
    { CAIRN_URL: "ftp://localhost", NODE_ENV: "development" },
  ])("fails open for invalid settings %j", (overrides) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(createCairnReporter({ ...env, ...overrides }).enabled).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining("password@"));
  });
  it("exports templates and status without private request/response content", async () => {
    const events: unknown[] = [];
    const sdk = createCairnReporter(
      { ...env, CAIRN_ENVIRONMENT: "staging" },
      async (url, init) => {
        if (url.endsWith("/requests")) {
          events.push(...JSON.parse(String(init?.body)));
        }
        return new Response("{}");
      },
    );
    const app = express();
    app.use(sdk.middleware);
    app.use(express.json());
    const router = Router();
    router.post("/teams/:team", (_req, res) =>
      res.status(503).json({ note: "PRIVATE-NOTES" }),
    );
    app.use("/v1/manager", router);
    const response = await request(app)
      .post("/v1/manager/teams/8033?token=PRIVATE-QUERY")
      .set("authorization", "Bearer PRIVATE-TOKEN")
      .send({ note: "PRIVATE-NOTES" });
    expect(response.status).toBe(503);
    expect(response.headers["x-cairn-request-id"]).toBeTruthy();
    await sdk.flush();
    await request(app).get("/PRIVATE-PATH");
    await sdk.shutdown();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      route: "/v1/manager/teams/:team",
      environment: "staging",
      service: "lovat-api",
      statusCode: 503,
    });
    expect(events[1]).toMatchObject({ route: "/__unmatched__" });
    expect(JSON.stringify(events)).not.toContain("PRIVATE-");
  });
  it("allows loopback in development and keeps collector outages off the response path", async () => {
    const sdk = createCairnReporter(
      { ...env, NODE_ENV: "development", CAIRN_URL: "http://127.0.0.1:3000" },
      async () => {
        throw new Error("offline");
      },
    );
    const app = express();
    app.use(sdk.middleware);
    app.get("/status", (_req, res) => res.json({ ok: true }));
    expect((await request(app).get("/status")).status).toBe(200);
    await sdk.shutdown(0);
  });
  it("hides unknown mount prefixes and skips unsupported methods", async () => {
    const events: unknown[] = [];
    const sdk = createCairnReporter(
      { ...env, NODE_ENV: undefined },
      async (url, init) => {
        if (url.endsWith("/requests")) {
          events.push(...JSON.parse(String(init?.body)));
        }
        return new Response("{}");
      },
    );
    const app = express();
    app.use(sdk.middleware);
    const router = Router();
    router.get("/data", (_req, res) => res.end());
    app.use("/private-tenant", router);
    app.all("/", (_req, res) => res.end());
    await request(app).get("/private-tenant/data");
    await request(app).trace("/");
    await sdk.shutdown();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      route: "/__unmatched__",
      environment: "development",
    });
  });
});
describe("Cairn shutdown", () => {
  it("registers no handlers while disabled", () => {
    const runtime = { once: vi.fn(), exit: vi.fn() };
    installCairnShutdown(
      {} as Server,
      { enabled: false, shutdown: vi.fn() },
      runtime as unknown as NodeJS.Process,
    );
    expect(runtime.once).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "drains once and exits after close (reject=%s)",
    async (reject) => {
      vi.useFakeTimers();
      try {
        const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
        let closed: () => void = () => undefined;
        const server = {
          close: vi.fn((cb: () => void) => {
            closed = cb;
          }),
          closeAllConnections: vi.fn(),
        };
        const shutdown = vi.fn(() =>
          reject ? Promise.reject(new Error("offline")) : Promise.resolve(),
        );
        installCairnShutdown(
          server as unknown as Server,
          { enabled: true, shutdown },
          runtime as unknown as NodeJS.Process,
        );
        runtime.emit("SIGTERM");
        runtime.emit("SIGINT");
        expect(server.close).toHaveBeenCalledTimes(1);
        closed();
        await Promise.resolve();
        expect(shutdown).toHaveBeenCalledWith(1000);
        expect(runtime.exit).toHaveBeenCalledWith(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("forces stuck connections closed after five seconds", async () => {
    vi.useFakeTimers();
    try {
      const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
      const server = { close: vi.fn(), closeAllConnections: vi.fn() };
      installCairnShutdown(
        server as unknown as Server,
        { enabled: true, shutdown: vi.fn() },
        runtime as unknown as NodeJS.Process,
      );
      runtime.emit("SIGTERM");
      await vi.advanceTimersByTimeAsync(5000);
      expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
      expect(runtime.exit).toHaveBeenCalledWith(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
