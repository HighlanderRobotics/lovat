import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createTbaClient, TbaHttpError } from "../src/providers/tba";
import type { TbaMatch } from "../src/providers/tba";

function clientWith(
  handler: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  // Tests only use fetch's call signature, not Bun-specific static methods.
  return createTbaClient({
    apiKey: "test-key",
    fetcher: handler as typeof fetch,
  });
}

describe("TBA requests", () => {
  test("uses the season, district and roster endpoints with validated responses", async () => {
    const paths: string[] = [];
    const client = clientWith(async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);

      return Response.json(
        path === "/api/v3/districts/2026"
          ? [
              {
                key: "2026fim",
                year: 2026,
                abbreviation: "fim",
                display_name: "Michigan",
              },
            ]
          : [],
      );
    });

    const districts = await client.getDistricts(2026);
    expect(districts.modified && districts.data[0]?.key).toBe("2026fim");

    await client.getDistrictTeams("2026fim");
    await client.getTournamentTeams("2026casj");
    await client.getSeasonTeamsPage(2026, 0);

    expect(paths).toEqual([
      "/api/v3/districts/2026",
      "/api/v3/district/2026fim/teams/simple",
      "/api/v3/event/2026casj/teams/simple",
      "/api/v3/teams/2026/0/simple",
    ]);
    expect(() => client.getDistricts(1991)).toThrow("year");
    expect(() => client.getSeasonTeamsPage(2026, -1)).toThrow("page");
  });

  test("sends authentication and validators and validates status", async () => {
    const client = clientWith(async (input, init) => {
      expect(String(input)).toBe(
        "https://www.thebluealliance.com/api/v3/status",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("X-TBA-Auth-Key")).toBe("test-key");
      expect(headers.get("If-None-Match")).toBe('"old"');
      expect(headers.get("If-Modified-Since")).toBe(
        "Wed, 07 Oct 2026 00:00:00 GMT",
      );
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeDefined();
      return Response.json(
        { max_team_page: 25 },
        { headers: { etag: '"new"' } },
      );
    });
    expect(
      await client.getStatus({
        etag: '"old"',
        lastModified: "Wed, 07 Oct 2026 00:00:00 GMT",
      }),
    ).toEqual({
      modified: true,
      data: { max_team_page: 25 },
      etag: '"new"',
      lastModified: null,
    });
  });

  test("304 retains validators without attempting to parse a body", async () => {
    const client = clientWith(async () => new Response(null, { status: 304 }));
    expect(await client.getTeamsPage(0, { etag: '"old"' })).toEqual({
      modified: false,
      etag: '"old"',
      lastModified: null,
    });
    await expect(client.getStatus()).rejects.toThrow(
      "without cache validators",
    );
  });

  test("accepts empty pages and nullable metadata", async () => {
    const client = clientWith(async (input) =>
      Response.json(
        String(input).includes("/teams/0/")
          ? []
          : [
              {
                key: "frc254",
                team_number: 254,
                name: "Team name",
                nickname: null,
                city: null,
                state_prov: null,
                country: null,
              },
            ],
      ),
    );
    const empty = await client.getTeamsPage(0);
    expect(empty.modified && empty.data).toEqual([]);
    const populated = await client.getTeamsPage(1);
    expect(populated.modified && populated.data[0]?.nickname).toBeNull();
    expect(() => client.getTeamsPage(-1)).toThrow("nonnegative integer");
  });

  test("rejects malformed responses", async () => {
    const client = clientWith(async () =>
      Response.json({ max_team_page: "25" }),
    );
    await expect(client.getStatus()).rejects.toThrow();
  });

  test("validates full match responses and event metadata without remappings", async () => {
    const alliance = {
      team_keys: ["frc254"],
      score: -1,
      dq_team_keys: [],
      surrogate_team_keys: [],
    };

    const match: TbaMatch = {
      key: "2026casj_qm1",
      event_key: "2026casj",
      comp_level: "qm",
      set_number: 1,
      match_number: 1,
      time: null,
      predicted_time: null,
      actual_time: null,
      post_result_time: null,
      winning_alliance: "",
      alliances: { red: alliance, blue: alliance },
      score_breakdown: { red: null, blue: null },
    };

    let malformed = false;

    const client = clientWith(async (input) => {
      const path = new URL(String(input)).pathname;

      if (path === "/api/v3/event/2026casj") {
        return Response.json({ key: "2026casj", playoff_type: 10 });
      }

      expect(path).toBe("/api/v3/event/2026casj/matches");

      return Response.json([
        malformed ? { ...match, comp_level: "unknown" } : match,
      ]);
    });

    const event = await client.getMatchEvent("2026casj");
    expect(event.modified && event.data.key).toBe("2026casj");

    const fetched = await client.getMatches("2026casj");
    expect(fetched.modified && fetched.data[0]).toEqual(match);

    malformed = true;
    await expect(client.getMatches("2026casj")).rejects.toThrow();
  });

  test("exposes HTTP status and retry hint without leaking response bodies", async () => {
    const client = clientWith(
      async () =>
        new Response("private upstream message", {
          status: 429,
          headers: { "Retry-After": "60" },
        }),
    );
    try {
      await client.getStatus();
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(TbaHttpError);
      const httpError = error as TbaHttpError;
      expect(httpError.status).toBe(429);
      expect(httpError.retryAfter).toBe("60");
      expect(httpError.message).not.toContain("private upstream message");
    }
  });

  test("rejects endpoint traversal before making a request", async () => {
    const client = clientWith(async () => {
      throw new Error("Should not fetch");
    });
    await expect(client.get("../../outside", z.unknown())).rejects.toThrow(
      "within /api/v3/",
    );
  });

  test("combines caller cancellation with the request timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = clientWith(async (_input, init) => {
      init?.signal?.throwIfAborted();
      return Response.json({ max_team_page: 0 });
    });
    await expect(
      client.getStatus({ signal: controller.signal }),
    ).rejects.toThrow();
  });
});
