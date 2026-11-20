import { createClient } from "redis";
import type { RateLimiter } from "./identity.js";
import { HttpError } from "./errors.js";
const consumeScript =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[2]) end; return n<=tonumber(ARGV[1]) and 1 or 0";
export function createState(url: string, prefix: string) {
  if (!prefix || /[*?\[\]\\]/.test(prefix))
    throw new Error("A non-glob Redis key prefix is required");
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => (retries > 1 ? false : 250),
    },
  });
  client.on("error", () => {});
  let connecting: Promise<unknown> | undefined;
  const connect = async () => {
    if (!client.isReady) {
      if (!connecting)
        connecting = client.connect().finally(() => {
          connecting = undefined;
        });
      await connecting;
    }
  };
  const limiter: RateLimiter = {
    async consume(key, limit, seconds) {
      try {
        await connect();
        return (
          Number(
            await client.eval(consumeScript, {
              keys: [prefix + "rate:" + key],
              arguments: [String(limit), String(seconds)],
            }),
          ) === 1
        );
      } catch {
        throw new HttpError(
          503,
          "RATE_LIMIT_UNAVAILABLE",
          "Authorization controls are temporarily unavailable",
        );
      }
    },
  };
  return {
    client,
    prefix,
    connect,
    limiter,
    oauth: {
      async put(key: string, value: string, ttl: number) {
        await connect();
        await client.set(prefix + "oauth:" + key, value, { EX: ttl });
      },
      async take(key: string) {
        await connect();
        return client.getDel(prefix + "oauth:" + key);
      },
    },
    cache: {
      async generations(teams: readonly number[]) {
        await connect();
        return (
          await client.mGet(teams.map((team) => prefix + "revision:" + team))
        ).map((value) => value ?? "0");
      },
      async get(key: string) {
        await connect();
        return client.get(prefix + "analysis:" + key);
      },
      async set(key: string, value: string, ttl: number) {
        await connect();
        await client.set(prefix + "analysis:" + key, value, { EX: ttl });
      },
    },
    async ready() {
      try {
        await connect();
        return (await client.ping()) === "PONG";
      } catch {
        return false;
      }
    },
    async close() {
      if (client.isOpen) await client.quit();
    },
  };
}
