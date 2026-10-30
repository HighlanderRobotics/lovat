import { beforeEach, expect, it, vi } from "vitest";
const kv = vi.hoisted(() => ({ get: vi.fn(), setEx: vi.fn() }));
vi.mock("../src/redisClient.js", () => ({ kv }));
import { publicCache } from "../src/lib/publicCache.js";
beforeEach(() => vi.resetAllMocks());
it("isolates public keys and bounds their lifetime", async () => {
  const calculate = vi.fn().mockResolvedValue({ prediction: null });
  await publicCache("match:1", calculate);
  expect(kv.get).toHaveBeenCalledWith("public:v1:match:1");
  expect(kv.setEx).toHaveBeenCalledWith(
    "public:v1:match:1",
    '{"prediction":null}',
    300,
  );
});
it("coalesces concurrent requests", async () => {
  let resolve!: (value: number) => void;
  const calculate = vi.fn(
    () =>
      new Promise<number>((done) => {
        resolve = done;
      }),
  );
  const first = publicCache("concurrent", calculate);
  const second = publicCache("concurrent", calculate);
  await vi.waitFor(() => expect(calculate).toHaveBeenCalledOnce());
  resolve(42);
  expect(await Promise.all([first, second])).toEqual([42, 42]);
});
it("recovers from cache outages and failed calculations", async () => {
  kv.get.mockRejectedValue(new Error("offline"));
  kv.setEx.mockRejectedValue(new Error("offline"));
  await expect(
    publicCache("retry", async () => {
      throw new Error("failed");
    }),
  ).rejects.toThrow("failed");
  await expect(publicCache("retry", async () => 42)).resolves.toBe(42);
});
