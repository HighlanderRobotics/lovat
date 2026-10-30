import { test, expect } from "bun:test";
import { runOcrPool } from "../src/ocr/pool";
test("native work never exceeds the configured capacity and every item runs once", async () => {
  let active = 0,
    peak = 0;
  const seen: number[] = [];
  await runOcrPool([1, 2, 3, 4, 5], 2, async (n) => {
    active++;
    peak = Math.max(active, peak);
    await Bun.sleep(2);
    seen.push(n);
    active--;
  });
  expect(peak).toBe(2);
  expect(active).toBe(0);
  expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  await expect(runOcrPool([1], 3, async () => {})).rejects.toThrow("1 or 2");
});
test("a fatal failure drains already-started work and does not start more videos", async () => {
  const seen: number[] = [];
  let drained = false;
  await expect(
    runOcrPool([1, 2, 3, 4], 2, async (n) => {
      seen.push(n);
      if (n === 1) {
        await Bun.sleep(1);
        throw Error("storage unavailable");
      }
      await Bun.sleep(4);
      drained = true;
    }),
  ).rejects.toThrow("storage unavailable");
  expect(drained).toBe(true);
  expect(seen.sort()).toEqual([1, 2]);
});
test("stopping does not start another video", async () => {
  let stop = false;
  const seen: number[] = [];
  await runOcrPool(
    [1, 2, 3],
    1,
    async (n) => {
      seen.push(n);
      stop = true;
    },
    () => stop,
  );
  expect(seen).toEqual([1]);
});
