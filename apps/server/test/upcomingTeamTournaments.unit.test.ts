import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
import { getUpcomingTeamTournaments } from "../src/handler/manager/getUpcomingTeamTournaments.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T20:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const event = (key: string, date: string, week: number | null = null) => ({
  key,
  name: key,
  city: "San Francisco",
  start_date: date,
  timezone: "America/Los_Angeles",
  week,
});

it("uses the authenticated team and returns the next two distinct future registrations", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json([
        event("past", "2026-10-31"),
        event("today", "2026-11-01"),
        event("third", "2027-03-10"),
        event("second", "2027-03-02", 1),
        event("first", "2026-11-03", 0),
        event("first", "2026-11-03", 0),
      ]),
    );
  vi.stubGlobal("fetch", fetcher);
  const response = await invoke(getUpcomingTeamTournaments, {
    query: { team: "9999" },
  });
  expect(fetcher.mock.calls[0][0]).toContain("/team/frc8033/events");
  expect(response.statusCode).toBe(200);
  expect(response.body).toEqual([
    {
      key: "first",
      name: "first",
      city: "San Francisco",
      startDate: "2026-11-03",
      week: 1,
    },
    {
      key: "second",
      name: "second",
      city: "San Francisco",
      startDate: "2027-03-02",
      week: 2,
    },
  ]);
});
it("does not fetch for a user without a team", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await invoke(getUpcomingTeamTournaments, {
    user: { ...testUser, teamNumber: null },
  });
  expect(response.body).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["upstream", "malformed", "timeout"])(
  "reports %s failures instead of showing an empty schedule",
  async (failure) => {
    vi.stubGlobal(
      "fetch",
      failure === "timeout"
        ? vi.fn().mockRejectedValue(new Error("timeout"))
        : vi
            .fn()
            .mockResolvedValue(
              failure === "upstream"
                ? new Response(null, { status: 401 })
                : Response.json([{}]),
            ),
    );
    expect((await invoke(getUpcomingTeamTournaments)).statusCode).toBe(502);
  },
);
it("returns an empty schedule when TBA lists no future registrations", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
  expect((await invoke(getUpcomingTeamTournaments)).body).toEqual([]);
});

it("uses the configured TBA key and handles date ties and missing event metadata", async () => {
  vi.stubEnv("TBA_KEY", "  test-key  ");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json([
      { ...event("b", "2026-11-03"), timezone: null },
      { ...event("a", "2026-11-03"), timezone: "", city: null },
      { ...event("invalid-zone", "2026-11-02"), timezone: "Invalid/Zone" },
    ]),
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await invoke(getUpcomingTeamTournaments);
  expect(fetcher.mock.calls[0][1].headers).toEqual({
    "X-TBA-Auth-Key": "test-key",
  });
  expect(response.body).toEqual([
    { key: "a", name: "a", city: null, startDate: "2026-11-03", week: null },
    {
      key: "b",
      name: "b",
      city: "San Francisco",
      startDate: "2026-11-03",
      week: null,
    },
  ]);
});
it("omits a blank TBA key", async () => {
  vi.stubEnv("TBA_KEY", "  ");
  const fetcher = vi.fn().mockResolvedValue(Response.json([]));
  vi.stubGlobal("fetch", fetcher);
  await invoke(getUpcomingTeamTournaments);
  expect(fetcher.mock.calls[0][1].headers).toEqual({});
});
