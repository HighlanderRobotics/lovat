import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import z from "zod";
import { afterAll, describe, expect, it } from "vitest";
import type { User } from "@lovat/db";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost/missing");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  databaseUrl.pathname !== "/lovat_test" ||
  !["localhost", "127.0.0.1"].includes(redisUrl.hostname) ||
  redisUrl.pathname !== "/15"
) {
  throw new Error(
    "Integration tests require local lovat_test PostgreSQL and Redis database 15",
  );
}

process.env.DOTENV_CONFIG_PATH = "/dev/null";

const { db } = await import("@lovat/db");
const { createAnalysisHandler } =
  await import("../src/handler/analysis/analysisHandler.js");
const { runAnalysis } =
  await import("../src/handler/analysis/analysisFunction.js");
const { invalidateCache } = await import("../src/lib/clearCache.js");
const { closeRedis, kv } = await import("../src/redisClient.js");

const fixtureId = randomUUID();
const teamNumber = -Math.floor(Math.random() * 1_000_000_000) - 1;
const tournamentKey = `test-${fixtureId}`;
const sourceRules = {
  teamSourceRule: { mode: "INCLUDE", items: [teamNumber] },
  tournamentSourceRule: { mode: "INCLUDE", items: [tournamentKey] },
};
const users = [
  {
    id: `first-${fixtureId}`,
    role: "ANALYST",
    username: null,
    email: "first@example.invalid",
    teamNumber: null,
    emailVerified: false,
    ...sourceRules,
  },
  {
    id: `second-${fixtureId}`,
    role: "ANALYST",
    username: null,
    email: "second@example.invalid",
    teamNumber: null,
    emailVerified: false,
    ...sourceRules,
  },
] satisfies User[];
const cacheKeys = new Set<string>();

afterAll(async () => {
  const rows = await db.cachedAnalysis.findMany({
    where: { key: { contains: fixtureId } },
    select: { key: true },
  });
  for (const row of rows) cacheKeys.add(row.key);
  if (cacheKeys.size) await kv.del([...cacheKeys]);
  await db.cachedAnalysis.deleteMany({
    where: { key: { contains: fixtureId } },
  });
  await closeRedis();
  await db.$disconnect();
});

describe.sequential(
  "analysis cache isolation against disposable services",
  () => {
    it("separates function results by user and invalidates each entry", async () => {
      let calculations = 0;
      const config = {
        argsSchema: z.object({}),
        createKey: () => ({
          key: [fixtureId, "function"],
          teamDependencies: [teamNumber],
          tournamentDependencies: [tournamentKey],
        }),
        calculateAnalysis: async (_params: object, ctx: { user: User }) => {
          calculations++;
          return { viewer: ctx.user.id };
        },
        usesDataSource: true,
        shouldCache: true,
      };

      expect(await runAnalysis(config, users[0], {})).toEqual({
        viewer: users[0].id,
      });
      expect(await runAnalysis(config, users[0], {})).toEqual({
        viewer: users[0].id,
      });
      expect(calculations).toBe(1);
      expect(await runAnalysis(config, users[1], {})).toEqual({
        viewer: users[1].id,
      });
      expect(calculations).toBe(2);

      const rows = await db.cachedAnalysis.findMany({
        where: { key: { contains: fixtureId } },
        select: { key: true },
      });
      expect(rows).toHaveLength(2);
      rows.forEach((row) => cacheKeys.add(row.key));

      await invalidateCache(teamNumber, tournamentKey);
      expect(
        await db.cachedAnalysis.count({
          where: { key: { contains: fixtureId } },
        }),
      ).toBe(0);
      for (const key of cacheKeys) expect(await kv.get(key)).toBeNull();

      expect(await runAnalysis(config, users[0], {})).toEqual({
        viewer: users[0].id,
      });
      expect(calculations).toBe(3);
    });

    it("separates HTTP analysis misses and hits by user", async () => {
      let calculations = 0;
      const testApp = express();
      testApp.use((req, _res, next) => {
        (req as AuthenticatedRequest).user =
          req.headers["x-test-viewer"] === "second" ? users[1] : users[0];
        next();
      });
      testApp.get(
        "/analysis",
        createAnalysisHandler({
          params: {},
          createKey: () => ({
            key: [fixtureId, "handler"],
            teamDependencies: [teamNumber],
          }),
          calculateAnalysis: async (_params, ctx) => {
            calculations++;
            return { viewer: ctx.user.id };
          },
          usesDataSource: true,
          shouldCache: true,
        }),
      );

      const waitForStoredCache = async (viewerId: string) => {
        for (let attempt = 0; attempt < 40; attempt++) {
          const row = await db.cachedAnalysis.findFirst({
            where: {
              key: {
                contains: `analysis:handler:${viewerId}:${fixtureId}:handler`,
              },
            },
            select: { key: true },
          });
          if (row && (await kv.get(row.key)) !== null) return row.key;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(`Cache entry for ${viewerId} was not persisted`);
      };

      const first = await request(testApp).get("/analysis");
      expect(first.status).toBe(200);
      expect(first.headers["x-lovat-cache"]).toBe("miss");
      expect(first.body.viewer).toBe(users[0].id);

      // The HTTP response is sent before the handler finishes persisting its cache.
      await waitForStoredCache(users[0].id);

      const repeat = await request(testApp).get("/analysis");
      expect(repeat.headers["x-lovat-cache"]).toBe("hit");
      expect(repeat.body.viewer).toBe(users[0].id);
      expect(calculations).toBe(1);

      const second = await request(testApp)
        .get("/analysis")
        .set("x-test-viewer", "second");
      expect(second.headers["x-lovat-cache"]).toBe("miss");
      expect(second.body.viewer).toBe(users[1].id);
      expect(calculations).toBe(2);
      await waitForStoredCache(users[1].id);
    });
  },
);
