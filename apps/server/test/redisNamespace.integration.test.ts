import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { expect, it, vi } from "vitest";
import { createNamespacedKv } from "../src/lib/namespacedKv.js";

const url = new URL(process.env.REDIS_URL ?? "redis://localhost/missing");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/15"
) {
  throw new Error("Redis namespace tests require loopback Redis database 15");
}

it("preserves foreign keys through connection and scoped reset across multiple scan batches", async () => {
  const redis = createClient({ url: url.toString() });
  const prefix = `lovat:test:${randomUUID()}:`;
  const foreignKey = `foreign:${randomUUID()}`;
  const kv = createNamespacedKv(redis, prefix);
  const keys = Array.from({ length: 350 }, (_, i) => `analysis:${i}`);

  await redis.connect();
  try {
    await redis.set(foreignKey, "keep");
    for (const key of keys) {
      await kv.set(key, "cached");
    }
    expect(await kv.get(keys[0])).toBe("cached");
    expect(await redis.get(foreignKey)).toBe("keep");
    expect(await kv.reset()).toBe(keys.length);
    expect(await redis.mGet(keys.map((key) => `${prefix}${key}`))).toEqual(
      keys.map(() => null),
    );
    expect(await redis.get(foreignKey)).toBe("keep");
    expect(await kv.reset()).toBe(0);
  } finally {
    await kv.reset();
    await redis.del(foreignKey);
    await redis.quit();
  }
});

it("connecting the Server Redis client preserves existing Lovat and foreign values", async () => {
  const rawRedis = createClient({ url: url.toString() });
  const prefix = `lovat:startup:${randomUUID()}:`;
  const foreignKey = `foreign:${randomUUID()}`;
  vi.stubEnv("REDIS_URL", url.toString());
  vi.stubEnv("REDIS_KEY_PREFIX", prefix);
  const { connectRedis, closeRedis, kv } =
    await import("../src/redisClient.js");
  await rawRedis.connect();
  try {
    await rawRedis.set(`${prefix}analysis:existing`, "keep");
    await rawRedis.set(foreignKey, "keep");
    await connectRedis();
    await connectRedis();
    expect(await kv.get("analysis:existing")).toBe("keep");
    expect(await rawRedis.get(foreignKey)).toBe("keep");
  } finally {
    await kv.reset();
    await rawRedis.del(foreignKey);
    await closeRedis();
    await rawRedis.quit();
    vi.unstubAllEnvs();
  }
});
