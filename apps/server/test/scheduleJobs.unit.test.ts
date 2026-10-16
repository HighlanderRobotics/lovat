import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/fetchTournaments.js", () => ({ default: vi.fn() }));
vi.mock("../src/lib/fetchTeams.js", () => ({ default: vi.fn() }));
vi.mock("../src/lib/fetchMatches.js", () => ({ default: vi.fn() }));
vi.mock("../src/lib/deleteOldRequests.js", () => ({ default: vi.fn() }));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    tournament: { count: vi.fn().mockResolvedValue(0) },
    team: { count: vi.fn().mockResolvedValue(0) },
  },
}));

import prisma from "../src/prismaClient.js";
import scheduleJobs from "../src/lib/scheduleJobs.js";
import fetchTournaments from "../src/lib/fetchTournaments.js";
import fetchTeams from "../src/lib/fetchTeams.js";
import fetchMatches from "../src/lib/fetchMatches.js";
import deleteOldRequests from "../src/lib/deleteOldRequests.js";

describe("background jobs at startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(prisma.tournament.count).mockResolvedValue(0);
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
    expect(fetchTournaments).not.toHaveBeenCalled();
    expect(fetchTeams).not.toHaveBeenCalled();
    expect(fetchMatches).not.toHaveBeenCalled();
    expect(deleteOldRequests).toHaveBeenCalledTimes(2);
  });

  it("imports and refreshes TBA data when development has a key", async () => {
    vi.stubEnv("TBA_KEY", "synthetic-test-key");
    await scheduleJobs();
    expect(fetchTournaments).toHaveBeenCalledWith(2024);
    expect(fetchTeams).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(fetchTournaments).toHaveBeenCalledTimes(2);
    expect(fetchTeams).toHaveBeenCalledTimes(2);
    expect(fetchMatches).toHaveBeenCalledTimes(24);
  });

  it("preserves production imports when a key is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(fetchTournaments).mockRejectedValueOnce(
      new Error("TBA unauthorized"),
    );
    await expect(scheduleJobs()).rejects.toThrow("TBA unauthorized");
    expect(fetchTournaments).toHaveBeenCalledWith(2024);
  });
});

it.each([true, false])(
  "skips existing imports only when both dev tables have data (%s)",
  async (hasTeams) => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TBA_KEY", "synthetic-test-key");
    vi.mocked(prisma.tournament.count).mockResolvedValue(1);
    vi.mocked(prisma.team.count).mockResolvedValue(hasTeams ? 1 : 0);
    vi.clearAllMocks();
    try {
      await scheduleJobs();
      expect(fetchTournaments).toHaveBeenCalledTimes(hasTeams ? 0 : 1);
      expect(fetchTeams).toHaveBeenCalledTimes(hasTeams ? 0 : 1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  },
);
