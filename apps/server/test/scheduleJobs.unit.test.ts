import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/fetchTeams.js", () => ({ default: vi.fn() }));
vi.mock("../src/lib/fetchMatches.js", () => ({ default: vi.fn() }));
vi.mock("../src/lib/expireReportsInProgress.js", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/deleteOldRequests.js", () => ({ default: vi.fn() }));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    team: { count: vi.fn().mockResolvedValue(0) },
  },
}));

import prisma from "../src/prismaClient.js";
import scheduleJobs from "../src/lib/scheduleJobs.js";
import fetchTeams from "../src/lib/fetchTeams.js";
import fetchMatches from "../src/lib/fetchMatches.js";
import expireReportsInProgress from "../src/lib/expireReportsInProgress.js";
import deleteOldRequests from "../src/lib/deleteOldRequests.js";

describe("background jobs at startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(prisma.team.count).mockResolvedValue(0);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TBA_KEY", "");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts without a TBA key and keeps local cleanup running", async () => {
    await scheduleJobs();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(fetchTeams).not.toHaveBeenCalled();
    expect(fetchMatches).not.toHaveBeenCalled();
    expect(deleteOldRequests).toHaveBeenCalledTimes(2);
    expect(expireReportsInProgress).toHaveBeenCalledTimes(2);
  });

  it("logs draft cleanup failures without stopping the scheduled job", async () => {
    const error = new Error("database unavailable");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(expireReportsInProgress).mockRejectedValueOnce(error);
    await scheduleJobs();
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(console.error).toHaveBeenCalledWith(
      "Report draft cleanup failed",
      expect.objectContaining({ name: "Error" }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      error.message,
    );
    expect(deleteOldRequests).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(expireReportsInProgress).toHaveBeenCalledTimes(2);
  });

  it("imports and refreshes TBA data when development has a key", async () => {
    vi.stubEnv("TBA_KEY", "synthetic-test-key");
    await scheduleJobs();
    expect(fetchTeams).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(fetchTeams).toHaveBeenCalledTimes(2);
    expect(fetchMatches).toHaveBeenCalledTimes(24);
  });

  it("reports failed request cleanup without skipping draft cleanup or the next run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(deleteOldRequests).mockRejectedValueOnce(
      new Error("private database details"),
    );
    await scheduleJobs();
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(expireReportsInProgress).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "Old request cleanup failed",
      expect.objectContaining({ name: "Error" }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private database details",
    );
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(deleteOldRequests).toHaveBeenCalledTimes(2);
    expect(expireReportsInProgress).toHaveBeenCalledTimes(2);
  });

  it.each(["teams", "matches"] as const)(
    "reports a failed %s refresh and runs again on schedule",
    async (job) => {
      vi.stubEnv("TBA_KEY", "synthetic-test-key");
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await scheduleJobs();
      const task = {
        teams: fetchTeams,
        matches: fetchMatches,
      }[job];
      vi.mocked(task).mockRejectedValueOnce(
        new Error("private provider details"),
      );
      const period = (job === "matches" ? 1 : 24) * 60 * 60 * 1000;
      const initialCalls = vi.mocked(task).mock.calls.length;
      await vi.advanceTimersByTimeAsync(period);
      expect(console.error).toHaveBeenCalledWith(
        job === "matches"
          ? "TBA match refresh failed"
          : "TBA daily refresh failed",
        expect.objectContaining({ name: "Error" }),
      );
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "private provider details",
      );
      await vi.advanceTimersByTimeAsync(period);
      expect(vi.mocked(task).mock.calls.length).toBe(initialCalls + 2);
    },
  );

  it("preserves production imports when a key is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(fetchTeams).mockRejectedValueOnce(new Error("TBA unauthorized"));
    await expect(scheduleJobs()).rejects.toThrow("TBA unauthorized");
  });
});

it.each([true, false])(
  "skips the team import when the dev team table has data (%s)",
  async (hasTeams) => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TBA_KEY", "synthetic-test-key");
    vi.mocked(prisma.team.count).mockResolvedValue(hasTeams ? 1 : 0);
    vi.clearAllMocks();
    try {
      await scheduleJobs();
      expect(fetchTeams).toHaveBeenCalledTimes(hasTeams ? 0 : 1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  },
);
