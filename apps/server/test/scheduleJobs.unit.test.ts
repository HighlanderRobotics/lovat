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

import scheduleJobs from "../src/lib/scheduleJobs.js";
import fetchTournaments from "../src/lib/fetchTournaments.js";
import fetchTeams from "../src/lib/fetchTeams.js";
import fetchMatches from "../src/lib/fetchMatches.js";
import deleteOldRequests from "../src/lib/deleteOldRequests.js";

describe("background jobs at startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
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
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetchMatches).toHaveBeenCalledTimes(1);
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
