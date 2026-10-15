import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/lib/publicCache.js", () => ({
  publicCache: async (_key: string, calculate: () => Promise<unknown>) =>
    calculate(),
}));

import {
  matchVideos,
  youtubeVideoIds,
} from "../src/handler/tournaments/matchVideos.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("projects unique YouTube IDs and rejects unsupported providers or injected URLs", () => {
  expect(
    youtubeVideoIds({
      videos: [
        { type: "youtube", key: "abcdefghijk" },
        { type: "youtube", key: "abcdefghijk" },
        { type: "tba", key: "ABCDEFGHIJK" },
        { type: "youtube", key: "https://evil.test" },
        { type: "youtube", key: "abc&param=1" },
      ],
      privateData: "hidden",
    }),
  ).toEqual(["abcdefghijk"]);
  expect(youtubeVideoIds({})).toEqual([]);
});

it("fetches only the canonical TBA match and returns IDs", async () => {
  vi.stubEnv("TBA_KEY", "test-key");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ videos: [{ type: "youtube", key: "abcdefghijk" }] }),
    );
  vi.stubGlobal("fetch", fetcher);

  expect(await matchVideos("2026casnf_qm4")).toEqual(["abcdefghijk"]);
  expect(fetcher).toHaveBeenCalledWith(
    "https://www.thebluealliance.com/api/v3/match/2026casnf_qm4",
    expect.objectContaining({
      headers: { "X-TBA-Auth-Key": "test-key", "User-Agent": "Lovat/26.0" },
      signal: expect.any(AbortSignal),
    }),
  );
});

it("keeps results available without a key, recording, or upstream service", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("TBA_KEY", "");
  expect(await matchVideos("2026casnf_qm4")).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();

  vi.stubEnv("TBA_KEY", "test-key");
  fetcher.mockResolvedValue(new Response(null, { status: 404 }));
  expect(await matchVideos("2026casnf_qm4")).toEqual([]);
  fetcher.mockRejectedValue(new Error("private upstream details"));
  expect(await matchVideos("2026casnf_qm4")).toEqual([]);
});
