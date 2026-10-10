import { z } from "zod";

const baseUrl = "https://www.thebluealliance.com/api/v3";

export type CacheHeaders = {
  etag?: string | null;
  lastModified?: string | null;
};

export type TbaResponse<T> =
  | {
      modified: true;
      data: T;
      etag: string | null;
      lastModified: string | null;
    }
  | { modified: false; etag: string | null; lastModified: string | null };

type RequestOptions = CacheHeaders & { signal?: AbortSignal };

export const tbaStatusSchema = z.object({
  max_team_page: z.number().int().nonnegative(),
});

export const tbaTeamSchema = z.object({
  key: z.string().min(1),
  team_number: z.number().int().positive(),
  nickname: z.string().nullable(),
  name: z.string(),
  city: z.string().nullable(),
  state_prov: z.string().nullable(),
  country: z.string().nullable(),
});

export type TbaTeam = z.infer<typeof tbaTeamSchema>;

export const tbaDistrictSchema = z.object({
  key: z.string().min(1),
  year: z.number().int().min(1992),
  abbreviation: z.string().min(1),
  display_name: z.string().min(1),
});

export type TbaDistrict = z.infer<typeof tbaDistrictSchema>;

export const tbaTournamentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  year: z.number().int().min(1992),
  city: z.string().nullable(),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  timezone: z.string().nullable(),
  event_type: z.number().int(),
  playoff_type: z.number().int().nullable(),
  parent_event_key: z.string().nullable(),
  district: z
    .object({
      key: z.string().min(1),
      year: z.number().int().min(1992),
      abbreviation: z.string().min(1),
      display_name: z.string().min(1),
    })
    .nullable(),
});

export type TbaTournament = z.infer<typeof tbaTournamentSchema>;

const tbaAllianceSchema = z.object({
  team_keys: z.array(z.string().min(1)).max(3),
  score: z.number().int().min(-1).nullable(),
  dq_team_keys: z.array(z.string()),
  surrogate_team_keys: z.array(z.string()),
});

export const tbaMatchSchema = z.object({
  key: z.string().min(1),
  event_key: z.string().min(1),
  comp_level: z.enum(["pm", "qm", "ef", "qf", "sf", "f"]),
  set_number: z.number().int().nonnegative(),
  match_number: z.number().int().positive(),
  time: z.number().int().nonnegative().nullable(),
  predicted_time: z.number().int().nonnegative().nullable(),
  actual_time: z.number().int().nonnegative().nullable(),
  post_result_time: z.number().int().nonnegative().nullable(),
  winning_alliance: z.enum(["", "red", "blue"]),
  alliances: z.object({ red: tbaAllianceSchema, blue: tbaAllianceSchema }),
  score_breakdown: z
    .object({
      red: z.record(z.string(), z.json()).nullable(),
      blue: z.record(z.string(), z.json()).nullable(),
    })
    .nullable(),
});

const tbaMatchEventSchema = z.object({
  key: z.string().min(1),
  playoff_type: z.number().int().nullable(),
  remap_teams: z.record(z.string(), z.string()).nullish(),
});

export type TbaMatch = z.infer<typeof tbaMatchSchema>;

export class TbaHttpError extends Error {
  constructor(
    public readonly resourceKey: string,
    public readonly status: number,
    public readonly retryAfter: string | null,
  ) {
    super(`TBA request failed: ${resourceKey} (HTTP ${status})`);
    this.name = "TbaHttpError";
  }
}

export function createTbaClient({
  apiKey = process.env.TBA_KEY,
  timeoutMs = 15_000,
  fetcher = fetch,
}: {
  apiKey?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
} = {}) {
  if (!apiKey?.trim()) throw new Error("TBA_KEY is required");
  const authKey = apiKey;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("TBA timeout must be a positive integer");
  }

  async function get<T>(
    resourceKey: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<TbaResponse<T>> {
    // Accept provider-relative paths only; never send credentials to another host.
    if (
      !resourceKey ||
      resourceKey.startsWith("/") ||
      resourceKey.includes("#")
    ) {
      throw new Error("TBA resource key must be a relative endpoint path");
    }
    const url = new URL(`${baseUrl}/${resourceKey}`);
    if (
      url.origin !== new URL(baseUrl).origin ||
      !url.pathname.startsWith("/api/v3/")
    ) {
      throw new Error("TBA resource key must stay within /api/v3/");
    }

    const headers = new Headers({ "X-TBA-Auth-Key": authKey });
    if (options.etag) headers.set("If-None-Match", options.etag);
    if (options.lastModified)
      headers.set("If-Modified-Since", options.lastModified);

    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetcher(url, {
      headers,
      redirect: "error",
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");

    if (response.status === 304) {
      if (!options.etag && !options.lastModified) {
        throw new Error(
          `TBA returned 304 without cache validators: ${resourceKey}`,
        );
      }
      return {
        modified: false,
        etag: etag ?? options.etag ?? null,
        lastModified: lastModified ?? options.lastModified ?? null,
      };
    }
    if (!response.ok) {
      throw new TbaHttpError(
        resourceKey,
        response.status,
        response.headers.get("retry-after"),
      );
    }

    return {
      modified: true,
      data: schema.parse(await response.json()),
      etag,
      lastModified,
    };
  }

  return {
    get,

    getDistricts(year: number, options?: RequestOptions) {
      validateYear(year);

      return get(`districts/${year}`, z.array(tbaDistrictSchema), options);
    },

    getDistrictTeams(districtKey: string, options?: RequestOptions) {
      return get(
        `district/${encodeURIComponent(districtKey)}/teams/simple`,
        z.array(tbaTeamSchema),
        options,
      );
    },

    getTournamentTeams(eventKey: string, options?: RequestOptions) {
      return get(
        `event/${encodeURIComponent(eventKey)}/teams/simple`,
        z.array(tbaTeamSchema),
        options,
      );
    },

    getSeasonTeamsPage(year: number, page: number, options?: RequestOptions) {
      validateYear(year);

      if (!Number.isSafeInteger(page) || page < 0)
        throw new Error("TBA team page must be a nonnegative integer");

      return get(
        `teams/${year}/${page}/simple`,
        z.array(tbaTeamSchema),
        options,
      );
    },

    getMatchEvent(eventKey: string) {
      return get(`event/${encodeURIComponent(eventKey)}`, tbaMatchEventSchema);
    },

    getMatches(eventKey: string, options?: RequestOptions) {
      return get(
        `event/${encodeURIComponent(eventKey)}/matches`,
        z.array(tbaMatchSchema),
        options,
      );
    },

    getStatus: (options?: RequestOptions) =>
      get("status", tbaStatusSchema, options),

    getTournaments(year: number, options?: RequestOptions) {
      if (!Number.isSafeInteger(year) || year < 1992) {
        throw new Error(
          "TBA tournament year must be an integer of 1992 or later",
        );
      }

      return get(`events/${year}`, z.array(tbaTournamentSchema), options);
    },

    getTeamsPage(page: number, options?: RequestOptions) {
      if (!Number.isSafeInteger(page) || page < 0) {
        throw new Error("TBA team page must be a nonnegative integer");
      }
      return get(`teams/${page}/simple`, z.array(tbaTeamSchema), options);
    },
  };
}

function validateYear(year: number) {
  if (!Number.isSafeInteger(year) || year < 1992 || year > 9999) {
    throw new Error("TBA year must be an integer between 1992 and 9999");
  }
}
