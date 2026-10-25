import { createClient } from "redis";

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

export const closeRedis = async (): Promise<void> => {
  if (connection && redis) {
    await connection;
    await redis.quit();
    redis = undefined;
    connection = undefined;
  }
};

const set = async (
  key: string,
  data: string,
): ReturnType<Awaited<ReturnType<typeof getRedis>>["set"]> => {
  return await (await getRedis()).set(key, data);
};

const get = async (
  key: string,
): ReturnType<Awaited<ReturnType<typeof getRedis>>["get"]> => {
  return await (await getRedis()).get(key);
};

const del = async (
  key: string[] | string,
): ReturnType<Awaited<ReturnType<typeof getRedis>>["del"]> => {
  return await (await getRedis()).del(key);
};

const flush = async (): ReturnType<
  Awaited<ReturnType<typeof getRedis>>["flushDb"]
> => {
  return await (await getRedis()).flushDb();
};

const incr = async (
  key: string,
): ReturnType<Awaited<ReturnType<typeof getRedis>>["incr"]> => {
  return await (await getRedis()).incr(key);
};

const exp = async (
  key: string,
  exp: number,
): ReturnType<Awaited<ReturnType<typeof getRedis>>["expire"]> => {
  return await (await getRedis()).expire(key, exp);
};

const setEx = async (
  key: string,
  data: string,
  seconds: number,
): ReturnType<Awaited<ReturnType<typeof getRedis>>["set"]> => {
  return await (await getRedis()).set(key, data, { EX: seconds });
};

export const kv = {
  set,
  get,
  del,
  flush,
  incr,
  exp,
  setEx,
};
