import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadEnvironmentFile } from "../src/lib/loadEnvironmentFile.js";
import { resetCacheState } from "../src/lib/resetCacheState.js";

test("cache reset removes Redis keys before database metadata", async () => {
  const calls: string[] = [];
  let resetCount = 0;

  const deleted = await resetCacheState({
    resetRedis: async () => {
      calls.push("redis");
      resetCount += 1;
      return resetCount;
    },
    deleteMetadata: async () => {
      calls.push("database");
    },
  });

  assert.equal(deleted, 3);
  assert.deepEqual(calls, ["redis", "database", "redis"]);
});

test("cache reset keeps database metadata when Redis reset fails", async () => {
  const calls: string[] = [];

  await assert.rejects(
    resetCacheState({
      resetRedis: async () => {
        calls.push("redis");
        throw new Error("Redis unavailable");
      },
      deleteMetadata: async () => {
        calls.push("database");
      },
    }),
    /Redis unavailable/,
  );

  assert.deepEqual(calls, ["redis"]);
});

test("cache reset removes entries written during metadata deletion", async () => {
  const cacheKeys = new Set(["existing"]);
  const metadataKeys = new Set(["existing"]);

  await resetCacheState({
    resetRedis: async () => {
      const deleted = cacheKeys.size;
      cacheKeys.clear();
      return deleted;
    },
    deleteMetadata: async () => {
      cacheKeys.add("concurrent");
      metadataKeys.add("concurrent");
      metadataKeys.clear();
    },
  });

  assert.deepEqual([...cacheKeys], []);
  assert.deepEqual([...metadataKeys], []);
});

test("explicit reset loads configuration from an environment file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lovat-cache-reset-"));
  const environmentPath = join(directory, ".env");
  const previousValue = process.env.REDIS_KEY_PREFIX;

  try {
    await writeFile(environmentPath, "REDIS_KEY_PREFIX=lovat:file-test:\n");
    delete process.env.REDIS_KEY_PREFIX;

    loadEnvironmentFile(environmentPath);

    assert.equal(process.env.REDIS_KEY_PREFIX, "lovat:file-test:");
  } finally {
    if (previousValue === undefined) delete process.env.REDIS_KEY_PREFIX;
    else process.env.REDIS_KEY_PREFIX = previousValue;

    await rm(directory, { recursive: true });
  }
});
