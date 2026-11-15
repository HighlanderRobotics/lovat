import { z } from "zod";
import { HttpError } from "./errors.js";
const eventKey = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const rankingSchema = z.object({
  rankings: z
    .array(
      z.object({
        team_key: z.string(),
        rank: z.number(),
        matches_played: z.number().optional(),
        sort_orders: z.array(z.number()).optional(),
        extra_stats: z.array(z.number()).optional(),
      }),
    )
    .max(10000)
    .nullable(),
});
export type OfficialReader = <T>(
  event: string,
  resource: string,
  schema: z.ZodType<T>,
) => Promise<T>;
async function readJson(response: Response) {
  if (!response.body) throw Error("Missing provider response");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        throw Error("Provider response exceeds limit");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return {
    value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
    size,
  };
}
/** Bound both provider work and retained response bytes, independently of entry count. */
export function createOfficialReader(
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): OfficialReader {
  const entries = new Map<
    string,
    { expires: number; value: unknown; size: number }
  >();
  const pending = new Map<string, Promise<unknown>>();
  let retained = 0;
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (entry) retained -= entry.size;
    entries.delete(id);
  };
  return async <T>(
    event: string,
    resource: string,
    schema: z.ZodType<T>,
  ): Promise<T> => {
    if (
      !eventKey.safeParse(event).success ||
      !["", "rankings", "teams/statuses"].includes(resource)
    )
      throw new HttpError(400, "INVALID_EVENT", "Invalid event");
    const id = event + (resource ? "/" + resource : ""),
      cached = entries.get(id);
    if (cached && cached.expires > Date.now())
      return schema.parse(cached.value);
    if (cached) remove(id);
    let work = pending.get(id);
    if (!work) {
      if (!key)
        throw new HttpError(
          503,
          "PROVIDER_UNAVAILABLE",
          "Official event data is unavailable",
        );
      if (pending.size >= 4)
        throw new HttpError(
          503,
          "PROVIDER_BUSY",
          "Official event data is busy",
        );
      work = (async () => {
        const response = await fetcher(
          "https://www.thebluealliance.com/api/v3/event/" + id,
          {
            headers: { "X-TBA-Auth-Key": key },
            signal: AbortSignal.timeout(5000),
            redirect: "error",
          },
        );
        if (!response.ok) throw Error("Official event data is unavailable");
        const data = await readJson(response);
        schema.parse(data.value);
        if (data.size <= 128 * 1024) {
          while (entries.size >= 32 || retained + data.size > 1024 * 1024)
            remove(entries.keys().next().value!);
          entries.set(id, { expires: Date.now() + 30000, ...data });
          retained += data.size;
        }
        return data.value;
      })()
        .catch(() => {
          throw new HttpError(
            502,
            "PROVIDER_UNAVAILABLE",
            "Official event data is unavailable",
          );
        })
        .finally(() => pending.delete(id));
      pending.set(id, work);
    }
    return schema.parse(await work);
  };
}
