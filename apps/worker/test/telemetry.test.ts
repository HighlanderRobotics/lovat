import { describe, expect, test, mock } from "bun:test";
import type { ImportJob, PrismaClient } from "@lovat/db";
import { createWorkerTelemetry } from "../src/telemetry";
import { runNextJob } from "../src/scheduler";
import { createHealthApp } from "../src/server";
const job = {
  id: "job-123",
  kind: "teams",
  targetKey: "PRIVATE-TARGET",
  attempts: 2,
  leaseToken: "PRIVATE-LEASE",
  leaseExpiresAt: new Date(Date.now() + 600000),
} as ImportJob;
const env = {
  CAIRN_ENABLED: "true",
  CAIRN_URL: "https://cairn.example",
  CAIRN_INGESTION_TOKEN: "test-only",
  NODE_ENV: "production",
};
describe("worker Cairn telemetry", () => {
  test("is disabled by default", async () => {
    const sdk = createWorkerTelemetry({});
    expect(sdk.requests).toBeUndefined();
    sdk.record(job, "success", new Date().toISOString());
    await sdk.shutdown();
  });
  test("exports metadata without job targets, lease tokens, or provider bodies", async () => {
    const sent: unknown[] = [];
    const sdk = createWorkerTelemetry(env, async (url, init) => {
      if (!url.endsWith("/health")) {
        sent.push({ url, events: JSON.parse(String(init?.body)) });
      }
      return new Response("{}");
    });
    const app = createHealthApp({
      isReady: () => true,
      checkDatabase: async () => {},
      middleware: sdk.requests?.middleware,
    });
    expect((await app.request("http://local/health")).status).toBe(200);
    sdk.record(job, "running", new Date().toISOString());
    sdk.record(job, "failed", new Date().toISOString());
    await sdk.shutdown();
    const json = JSON.stringify(sent);
    expect(json).toContain('"attempt":3');
    expect(json).toContain('"outcome":"failed"');
    expect(json).toContain('"service":"lovat-worker"');
    expect(json).not.toContain("PRIVATE-");
  });
  test("fails open on invalid production endpoints", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const sdk = createWorkerTelemetry({
        ...env,
        CAIRN_URL: "http://cairn.example",
      });
      expect(sdk.requests).toBeUndefined();
      await sdk.shutdown();
    } finally {
      console.warn = warn;
    }
  });
  test("only reports success for committed lease completion", async () => {
    for (const count of [1, 0]) {
      const observe = mock((..._args: unknown[]) => {});
      const db = {
        $queryRaw: mock(async () => [job]),
        importJob: { updateMany: mock(async () => ({ count })) },
      } as unknown as PrismaClient;
      await runNextJob(db, async () => {}, observe);
      expect(observe.mock.calls.map((v) => v[1])).toEqual([
        "running",
        count ? "success" : "cancelled",
      ]);
    }
  });
  test("reports persisted failure and isolates collector exceptions", async () => {
    const observe = mock((..._args: unknown[]) => {});
    const db = {
      $queryRaw: mock(async () => [job]),
      importJob: { updateMany: mock(async () => ({ count: 1 })) },
    } as unknown as PrismaClient;
    await runNextJob(
      db,
      async () => {
        throw new Error("PRIVATE-BODY");
      },
      observe,
    );
    expect(observe.mock.calls.map((v) => v[1])).toEqual(["running", "failed"]);
    await expect(
      runNextJob(
        db,
        async () => {},
        () => {
          throw new Error("collector");
        },
      ),
    ).resolves.toBe(true);
  });
});
