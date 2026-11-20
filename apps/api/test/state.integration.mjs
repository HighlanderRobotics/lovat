import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createState } from "../dist/state.js";
const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
if (
  process.env.LOVAT_REDIS_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw new Error("Enable LOVAT_REDIS_TEST with a loopback Redis service");
test("Redis enforces atomic budgets, consumes OAuth state once and expires cached values", async (t) => {
  const prefix = "lovat:rewrite-test:" + randomUUID() + ":",
    state = createState(url.href, prefix);
  const keys = [
    prefix + "rate:budget",
    prefix + "oauth:test",
    prefix + "analysis:test",
    prefix + "revision:8033",
  ];
  t.after(async () => {
    await state.client.del(keys);
    await state.close();
  });
  assert.equal(await state.ready(), true);
  const accepted = await Promise.all(
    Array.from({ length: 30 }, () => state.limiter.consume("budget", 3, 60)),
  );
  assert.equal(accepted.filter(Boolean).length, 3);
  assert.ok((await state.client.ttl(keys[0])) <= 60);
  await state.oauth.put("test", "8033", 600);
  const claims = await Promise.all([
    state.oauth.take("test"),
    state.oauth.take("test"),
  ]);
  assert.deepEqual(claims.sort(), ["8033", null].sort());
  await state.cache.set("test", "{}", 15);
  assert.equal(await state.cache.get("test"), "{}");
  assert.ok((await state.client.ttl(keys[2])) <= 15);
  await state.client.set(keys[3], "1234567890123456789");
  assert.deepEqual(await state.cache.generations([8033, 1]), [
    "1234567890123456789",
    "0",
  ]);
});
