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
