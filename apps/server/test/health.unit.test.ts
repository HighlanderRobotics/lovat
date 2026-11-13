import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHealth } from "../src/lib/health.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("stays unready until startup, and after shutdown, without running probes", async () => {
  const check = vi.fn().mockResolvedValue(undefined);
  const health = createHealth([check]);
  expect(await health.ready()).toBe(false);
  expect(check).not.toHaveBeenCalled();
  health.start();
  expect(await health.ready()).toBe(true);
  health.stop();
  expect(health.isStopping()).toBe(true);
  expect(await health.ready()).toBe(false);
  expect(check).toHaveBeenCalledTimes(1);
});

it.each([0, 1])(
  "fails readiness when critical dependency %s rejects, then recovers",
  async (failed) => {
    const checks = [
      vi.fn().mockResolvedValue(1),
      vi.fn().mockResolvedValue("PONG"),
    ];
    checks[failed].mockRejectedValueOnce(
      new Error("postgres://private-secret"),
    );
    const health = createHealth(checks);
    health.start();
    expect(await health.ready()).toBe(false);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await health.ready()).toBe(true);
  },
);

it("coalesces concurrent probes and caches short-lived results", async () => {
  const check = vi.fn().mockResolvedValue(1);
  const health = createHealth([check]);
  health.start();
  expect(
    await Promise.all(Array.from({ length: 100 }, () => health.ready())),
  ).toEqual(Array(100).fill(true));
  expect(check).toHaveBeenCalledTimes(1);
  expect(await health.ready()).toBe(true);
  expect(check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1001);
  expect(await health.ready()).toBe(true);
  expect(check).toHaveBeenCalledTimes(2);
});

it("bounds a stalled probe without accumulating further driver calls", async () => {
  const stalled = vi.fn(() => new Promise(() => undefined));
  const health = createHealth([stalled]);
  health.start();
  const result = health.ready();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toBe(false);
  await vi.advanceTimersByTimeAsync(1001);
  const retry = health.ready();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await retry).toBe(false);
  expect(stalled).toHaveBeenCalledTimes(1);
});

it("cannot become ready if shutdown starts while a probe is pending", async () => {
  let finish!: () => void;
  const health = createHealth([
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  ]);
  health.start();
  const result = health.ready();
  await vi.advanceTimersByTimeAsync(0);
  health.stop();
  finish();
  expect(await result).toBe(false);
});
