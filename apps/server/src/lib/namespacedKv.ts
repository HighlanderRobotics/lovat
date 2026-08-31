const RESET_BATCH_SIZE = 100;

type RedisInteger = `${number}` | number;
type RedisKey = Buffer | string;

export type RedisKeyValueClient = {
  set(key: string, data: string, options?: { EX: number }): Promise<unknown>;
  get(key: string): Promise<Buffer | string | null>;
  del(keys: RedisKey[] | RedisKey): Promise<RedisInteger>;
  incr(key: string): Promise<RedisInteger>;
  expire(key: string, seconds: number): Promise<unknown>;
  scanIterator(options: {
    MATCH: string;
    COUNT: number;
  }): AsyncIterable<RedisKey[]>;
};

export type NamespacedKv = {
  set(key: string, data: string): Promise<unknown>;
  get(key: string): Promise<Buffer | string | null>;
  del(keys: string[] | string): Promise<number>;
  incr(key: string): Promise<number>;
  exp(key: string, seconds: number): Promise<unknown>;
  setEx(key: string, data: string, seconds: number): Promise<unknown>;
  reset(): Promise<number>;
};

export const createNamespacedKv = (
  redis: RedisKeyValueClient,
  keyPrefix: string,
): NamespacedKv => {
  const namespacedKey = (key: string): string => `${keyPrefix}${key}`;

  const set = async (key: string, data: string): Promise<unknown> => {
    return await redis.set(namespacedKey(key), data);
  };

  const get = async (key: string): Promise<Buffer | string | null> => {
    return await redis.get(namespacedKey(key));
  };

  const del = async (keys: string[] | string): Promise<number> => {
    const namespacedKeys = Array.isArray(keys)
      ? keys.map(namespacedKey)
      : namespacedKey(keys);

    return Number(await redis.del(namespacedKeys));
  };

  const incr = async (key: string): Promise<number> => {
    return Number(await redis.incr(namespacedKey(key)));
  };

  const exp = async (key: string, seconds: number): Promise<unknown> => {
    return await redis.expire(namespacedKey(key), seconds);
  };

  const setEx = async (
    key: string,
    data: string,
    seconds: number,
  ): Promise<unknown> => {
    return await redis.set(namespacedKey(key), data, { EX: seconds });
  };

  const reset = async (): Promise<number> => {
    let deleted = 0;

    for await (const keys of redis.scanIterator({
      MATCH: `${keyPrefix}*`,
      COUNT: RESET_BATCH_SIZE,
    })) {
      if (keys.length > 0) deleted += Number(await redis.del(keys));
    }

    return deleted;
  };

  return {
    set,
    get,
    del,
    incr,
    exp,
    setEx,
    reset,
  };
};
