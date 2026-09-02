import { createClient } from "redis";
import { createNamespacedKv } from "./lib/namespacedKv.js";

const DEFAULT_KEY_PREFIX = "lovat:";

const getKeyPrefix = (): string => {
  return process.env.REDIS_KEY_PREFIX?.trim() || DEFAULT_KEY_PREFIX;
};

const redisClient = createClient({ url: process.env.REDIS_URL }).on(
  "error",
  (err) => console.log("Redis Client Error", err),
);

export const kv = createNamespacedKv(redisClient, getKeyPrefix());

export const connectRedis = async (): Promise<void> => {
  if (!redisClient.isOpen) await redisClient.connect();
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient.isOpen) await redisClient.close();
};
