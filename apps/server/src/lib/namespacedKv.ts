const RESET_BATCH_SIZE = 100;

type RedisInteger = `${number}` | number;
type RedisKey = Buffer | string;

export type RedisKeyValueClient = {
  set(key: string, data: string, options?: { EX: number }): Promise<unknown>;
  get(key: string): Promise<unknown>;
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
  if (!keyPrefix.trim()) {
    throw new Error("Redis key prefix cannot be empty");
  }

  if (["*", "?", "[", "]", "\\"].some((char) => keyPrefix.includes(char))) {
    throw new Error("Redis key prefix cannot contain Redis glob characters");
  }

  const namespacedKey = (key: string): string => `${keyPrefix}${key}`;

  const set = async (key: string, data: string): Promise<unknown> => {
    return await redis.set(namespacedKey(key), data);
  };

  const get = async (key: string): Promise<Buffer | string | null> => {
    // Redis defaults to UTF-8 strings; clients may also opt into Buffer values.
    return (await redis.get(namespacedKey(key))) as Buffer | string | null;
  };

  const del = async (keys: string[] | string): Promise<number> => {
    if (Array.isArray(keys) && keys.length === 0) {
      return 0;
    }

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
      // COUNT is a hint: compact Redis encodings can return larger batches.
      for (let offset = 0; offset < keys.length; offset += RESET_BATCH_SIZE) {
        deleted += Number(
          await redis.del(keys.slice(offset, offset + RESET_BATCH_SIZE)),
        );
      }
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
