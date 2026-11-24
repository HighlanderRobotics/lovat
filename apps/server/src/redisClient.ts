import { createClient } from "redis";
import { createNamespacedKv } from "./lib/namespacedKv.js";

const createRedisClient = () =>
  createClient({ url: process.env.REDIS_URL }).on("error", (err) =>
    console.log("Redis Client Error", err),
  );

type RedisClient = ReturnType<typeof createRedisClient>;
let redis: RedisClient | undefined;
let connection: Promise<RedisClient> | undefined;

const getRedis = () => {
  if (!connection) {
    redis = createRedisClient();
    connection = redis.connect();
  }
  return connection;
};

export const connectRedis = async (): Promise<void> => {
  await getRedis();
};

/** Readiness must not open a second connection or queue a ping while offline. */
export const pingRedis = async (): Promise<void> => {
  if (!redis?.isReady) {
    throw new Error("Redis unavailable");
  }
  await redis.ping();
};

export const closeRedis = async (): Promise<void> => {
  if (connection && redis) {
    await connection;
    await redis.quit();
    redis = undefined;
    connection = undefined;
  }
};

export const kv = createNamespacedKv(
  {
    set: async (key, data, options) =>
      options
        ? (await getRedis()).set(key, data, options)
        : (await getRedis()).set(key, data),
    get: async (key) => (await getRedis()).get(key),
    del: async (keys) => (await getRedis()).del(keys),
    incr: async (key) => (await getRedis()).incr(key),
    expire: async (key, seconds) => (await getRedis()).expire(key, seconds),
    async *scanIterator(options) {
      yield* (await getRedis()).scanIterator(options);
    },
  },
  process.env.REDIS_KEY_PREFIX?.trim() || "lovat:",
);
