import { describe, expect, it } from "vitest";
import { tbaEventUrl } from "../src/lib/tbaEventUrl.js";

describe("TBA event URL", () => {
  it.each([
    ["event", ""],
    ["matches", "/matches"],
    ["teams", "/teams"],
    ["simpleTeams", "/teams/simple"],
    ["teamStatuses", "/teams/statuses"],
    ["rankings", "/rankings"],
  ] as const)("keeps %s on the fixed TBA event route", (resource, suffix) => {
    const url = new URL(tbaEventUrl("2026casnf", resource));

    expect(url.origin).toBe("https://www.thebluealliance.com");
    expect(url.pathname).toBe(`/api/v3/event/2026casnf${suffix}`);
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it.each(["", "not an event", "event\n", "2026.event"])(
    "rejects malformed event identifiers (%j)",
    (key) => {
      expect(() => tbaEventUrl(key, "event")).toThrow("Invalid TBA event key");
    },
  );
});
