import { createClient } from "redis";
import { createNamespacedKv } from "./lib/namespacedKv.js";

const DEFAULT_KEY_PREFIX = "lovat:";

const getKeyPrefix = (): string => {
  const prefix = process.env.REDIS_KEY_PREFIX?.trim() || DEFAULT_KEY_PREFIX;

  if (/[*?\[\]]/.test(prefix)) {
    throw new Error("REDIS_KEY_PREFIX cannot contain Redis glob characters");
  }

  return prefix;
};

const redisClient = createClient({ url: process.env.REDIS_URL }).on(
  "error",
  (err) => console.log("Redis Client Error", err),
);

await redisClient.connect();

export const kv = createNamespacedKv(redisClient, getKeyPrefix());
