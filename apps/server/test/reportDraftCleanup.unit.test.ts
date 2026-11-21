import { afterEach, expect, it, vi } from "vitest";

const update = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 1 }));
vi.mock("../src/prismaClient.js", () => ({
  default: { scoutReportInProgress: { updateMany: update } },
}));
import expireReportsInProgress from "../src/lib/expireReportsInProgress.js";
import { trainingPlaybackEnd } from "../src/handler/training/trainingTiming.js";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it.each([true, false])(
  "abandons expired drafts and scrubs payloads at thirty days (explicit time: %s)",
  async (explicit) => {
    const now = new Date("2026-11-01T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    await expireReportsInProgress(explicit ? now : undefined);
    expect(update).toHaveBeenNthCalledWith(1, {
      where: {
        status: { in: ["LOADED", "STARTED", "ENDED"] },
        expiresAt: { lte: now },
      },
      data: { status: "ABANDONED" },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: {
        status: "ABANDONED",
        expiresAt: { lte: new Date(now.getTime() - 23 * 86_400_000) },
        NOT: { payload: { equals: {} } },
      },
      data: { payload: {} },
    });
  },
);

it("preserves cleanup errors for the scheduler to report", async () => {
  update.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(expireReportsInProgress()).rejects.toThrow(
    "database unavailable",
  );
  expect(update).toHaveBeenCalledTimes(1);
});

it("keeps a fifteen-second post-match window after video playback", () => {
  const start = new Date("2026-11-01T12:00:00Z");
  expect(trainingPlaybackEnd(start, 166)).toBe(start.getTime() + 181_000);
});
