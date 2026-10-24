import { kv } from "../redisClient.js";

const pending = new Map<string, Promise<unknown>>();

// Public projections have their own namespace and a bounded lifetime.
export async function publicCache<T>(
  key: string,
  calculate: () => Promise<T>,
  seconds = 300,
): Promise<T> {
  const cacheKey = `public:v1:${key}`;
  const existing = pending.get(cacheKey);

  if (existing) return existing as Promise<T>;

  const request = (async () => {
    try {
      const saved = await kv.get(cacheKey);

      if (saved) return JSON.parse(saved.toString()) as T;
    } catch {
      // A cache outage must not expose private caches or prevent public reads.
    }

    const result = await calculate();

    try {
      await kv.setEx(cacheKey, JSON.stringify(result), seconds);
    } catch {
      // Return the calculated public projection even if Redis is unavailable.
    }

    return result;
  })();

  pending.set(cacheKey, request);

  try {
    return await request;
  } finally {
    pending.delete(cacheKey);
  }
}
