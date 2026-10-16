import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let fetchPracticeMatches: typeof import("../src/lib/fetchPracticeMatches.js").fetchPracticeMatches;

describe("Nexus practice schedule fetching", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NEXUS_API_KEY", "synthetic-test-key");
    ({ fetchPracticeMatches } =
      await import("../src/lib/fetchPracticeMatches.js"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns no practice matches when Nexus does not have the event", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("Event not found", { status: 404 })),
    );

    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([]);
  });

  it("skips network requests when Nexus is not configured", async () => {
    vi.stubEnv("NEXUS_API_KEY", "   ");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores non-practice labels, invalid match numbers, and matches with no valid teams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          matches: [
            { label: "Qualification 1", redTeams: ["8033"] },
            { label: "Practice 0", redTeams: ["8033"] },
            { label: "Practice 32768", redTeams: ["8033"] },
            { label: "Practice 3" },
            { label: "Practice 4", redTeams: ["9".repeat(400)] },
          ],
        }),
      ),
    );

    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([]);
  });

  it("does not cache malformed successful responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ matches: "not an array" }))
      .mockResolvedValueOnce(Response.json({ matches: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPracticeMatches("2026casf")).rejects.toThrow();
    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest cached event when the cache reaches its limit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => Response.json({ matches: [] }));
    vi.stubGlobal("fetch", fetchMock);

    for (let index = 0; index < 101; index++) {
      await fetchPracticeMatches(`2026fixture${index}`);
    }
    expect(fetchMock).toHaveBeenCalledTimes(101);
    await fetchPracticeMatches("2026fixture1");
    expect(fetchMock).toHaveBeenCalledTimes(101);
    await fetchPracticeMatches("2026fixture0");
    expect(fetchMock).toHaveBeenCalledTimes(102);
  });

  it("skips invalid team entries while keeping valid teams in partial schedules", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          matches: [
            {
              label: "Practice 1",
              redTeams: [null, "", "8033", "unknown", "1e2", "1.5"],
              blueTeams: ["0", "-254", "2147483648", "254"],
            },
          ],
        }),
      ),
    );

    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([
      { matchNumber: 1, teamNumbers: [8033, 254] },
    ]);
  });

  it("includes each team only once per practice match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          matches: [
            {
              label: "Practice 1",
              redTeams: ["8033", "8033"],
              blueTeams: ["8033", "254"],
            },
          ],
        }),
      ),
    );

    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([
      { matchNumber: 1, teamNumbers: [8033, 254] },
    ]);
  });

  it("still reports an invalid API key as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })),
    );

    await expect(fetchPracticeMatches("2026casf")).rejects.toThrow(
      "Failed to fetch Nexus event",
    );
  });

  it("skips marked replays even when their labels look like original matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          matches: [
            { label: "Practice 4", redTeams: ["8033"] },
            {
              label: "Practice 4",
              replayOf: "Practice 4",
              redTeams: ["254"],
            },
            {
              label: "Practice 4 Replay",
              replayOf: "Practice 4",
              redTeams: ["971"],
            },
          ],
        }),
      ),
    );

    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([
      { matchNumber: 4, teamNumbers: [8033] },
    ]);
  });

  it("imports original practice matches when replayOf is absent or null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          matches: [
            { label: "Practice 1", redTeams: ["8033"] },
            { label: "Practice 2", replayOf: null, blueTeams: ["254"] },
          ],
        }),
      ),
    );

    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([
      { matchNumber: 1, teamNumbers: [8033] },
      { matchNumber: 2, teamNumbers: [254] },
    ]);
  });

  it("reuses a schedule for one minute, then fetches an updated schedule", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          matches: [{ label: "Practice 1", redTeams: ["8033"] }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          matches: [{ label: "Practice 1", redTeams: ["254"] }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchPracticeMatches("2026casf");
    vi.setSystemTime(59_999);
    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([
      { matchNumber: 1, teamNumbers: [8033] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(60_000);
    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([
      { matchNumber: 1, teamNumbers: [254] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps separate cached schedules for different events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          matches: [{ label: "Practice 1", redTeams: ["8033"] }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          matches: [{ label: "Practice 1", redTeams: ["254"] }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchPracticeMatches("2026casf");
    await fetchPracticeMatches("2026camb");
    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([
      { matchNumber: 1, teamNumbers: [8033] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("briefly caches unavailable events to avoid repeated 404 requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Event not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPracticeMatches("2026casf");
    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed request instead of caching the failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Nexus unavailable"))
      .mockResolvedValueOnce(Response.json({ matches: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPracticeMatches("2026casf")).rejects.toThrow(
      "Nexus unavailable",
    );
    await expect(fetchPracticeMatches("2026casf")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one request between simultaneous imports of the same event", async () => {
    let completeRequest!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      completeRequest = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchPracticeMatches("2026casf");
    const second = fetchPracticeMatches("2026casf");
    completeRequest(
      Response.json({
        matches: [{ label: "Practice 1", redTeams: ["8033"] }],
      }),
    );

    const results = await Promise.all([first, second]);
    expect(results).toEqual([
      [{ matchNumber: 1, teamNumbers: [8033] }],
      [{ matchNumber: 1, teamNumbers: [8033] }],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
