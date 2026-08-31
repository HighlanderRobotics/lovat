import assert from "node:assert/strict";
import test from "node:test";

import { createNamespacedKv } from "../src/lib/namespacedKv.js";

class InMemoryRedis {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();

  async set(
    key: string,
    value: string,
    options?: { EX: number },
  ): Promise<"OK"> {
    this.values.set(key, value);
    if (options) this.expirations.set(key, options.EX);
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(keys: Buffer | string | (Buffer | string)[]): Promise<number> {
    const keysToDelete = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;

    for (const key of keysToDelete) {
      const stringKey = key.toString();
      if (this.values.delete(stringKey)) deleted += 1;
      this.expirations.delete(stringKey);
    }

    return deleted;
  }

  async incr(key: string): Promise<number> {
    const value = Number(this.values.get(key) ?? "0") + 1;
    this.values.set(key, String(value));
    return value;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.values.has(key)) return 0;
    this.expirations.set(key, seconds);
    return 1;
  }

  async *scanIterator(options: {
    MATCH: string;
    COUNT: number;
  }): AsyncGenerator<string[]> {
    const prefix = options.MATCH.slice(0, -1);
    const keys = [...this.values.keys()].filter((key) =>
      key.startsWith(prefix),
    );

    if (keys.length > 0) yield keys;
  }
}

test("all key operations stay inside the Lovat namespace", async () => {
  const redis = new InMemoryRedis();
  const kv = createNamespacedKv(redis, "lovat:test:");

  await kv.set("analysis:one", "cached");
  await kv.setEx("posthog:alias:one", "1", 60);
  await kv.incr("auth:apikey:one:rate");
  await kv.exp("auth:apikey:one:rate", 3);

  assert.equal(redis.values.get("lovat:test:analysis:one"), "cached");
  assert.equal(redis.values.get("lovat:test:posthog:alias:one"), "1");
  assert.equal(redis.values.get("lovat:test:auth:apikey:one:rate"), "1");
  assert.equal(redis.expirations.get("lovat:test:posthog:alias:one"), 60);
  assert.equal(redis.expirations.get("lovat:test:auth:apikey:one:rate"), 3);
  assert.equal(await kv.get("analysis:one"), "cached");

  await kv.del(["analysis:one", "posthog:alias:one"]);

  assert.equal(redis.values.has("lovat:test:analysis:one"), false);
  assert.equal(redis.values.has("lovat:test:posthog:alias:one"), false);
});

test("reset removes only namespaced keys", async () => {
  const redis = new InMemoryRedis();
  const kv = createNamespacedKv(redis, "lovat:test:");
  redis.values.set("foreign:session", "keep");
  redis.values.set("another-app:cache", "keep");
  await kv.set("analysis:one", "remove");
  await kv.set("auth:team:8033", "remove");

  await kv.reset();

  assert.deepEqual([...redis.values.entries()].sort(), [
    ["another-app:cache", "keep"],
    ["foreign:session", "keep"],
  ]);
});
