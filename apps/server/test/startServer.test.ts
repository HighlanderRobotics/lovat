import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "redis";

import { startServer } from "../src/lib/startServer.js";

const redisTestUrl = process.env.REDIS_TEST_URL;

test(
  "normal startup leaves pre-existing Redis keys untouched",
  { skip: redisTestUrl ? false : "REDIS_TEST_URL is not configured" },
  async () => {
    assert.ok(redisTestUrl);

    process.env.REDIS_URL = redisTestUrl;
    process.env.REDIS_KEY_PREFIX = "lovat:test:startup:";

    const { closeRedis, connectRedis, kv } =
      await import("../src/redisClient.js");
    const rawRedis = createClient({ url: redisTestUrl });
    const foreignKey = "foreign:test:startup-preservation";
    const lovatKey = "lovat:test:startup:analysis:existing";
    let jobsScheduled = false;
    let listening = false;

    await rawRedis.connect();

    try {
      await rawRedis.set(foreignKey, "keep");
      await rawRedis.set(lovatKey, "keep");

      await startServer({
        initializeCache: connectRedis,
        scheduleJobs: async () => {
          jobsScheduled = true;
        },
        listen: () => {
          listening = true;
        },
      });

      assert.equal(jobsScheduled, true);
      assert.equal(listening, true);
      assert.equal(await rawRedis.get(foreignKey), "keep");
      assert.equal(await rawRedis.get(lovatKey), "keep");
    } finally {
      await kv.reset();
      await rawRedis.del(foreignKey);
      await closeRedis();
      await rawRedis.close();
    }
  },
);
