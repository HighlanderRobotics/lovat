import { expect, test, vi } from "vitest";
import scheduleJobs from "../src/lib/scheduleJobs.js";

test("API scheduler starts without provider credentials or periodic work", async () => {
  const interval = vi.spyOn(globalThis, "setInterval");
  try {
    await expect(scheduleJobs()).resolves.toBeUndefined();
    expect(interval).not.toHaveBeenCalled();
  } finally {
    interval.mockRestore();
  }
});

test("configured APNs starts only the Live Activity delivery timer", async () => {
  vi.stubEnv("APNS_KEY_ID", "test-key");
  vi.stubEnv("APNS_TEAM_ID", "test-team");
  vi.stubEnv("APNS_PRIVATE_KEY", "test-placeholder");
  vi.useFakeTimers();
  const interval = vi.spyOn(globalThis, "setInterval");

  try {
    await scheduleJobs();
    expect(interval).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      30_000,
    );
  } finally {
    interval.mockRestore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});
