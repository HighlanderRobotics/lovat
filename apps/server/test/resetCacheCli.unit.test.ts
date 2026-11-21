import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  reset: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("../src/lib/loadEnvironmentFile.js", () => ({
  loadEnvironmentFile: mocks.load,
}));
vi.mock("../src/lib/clearCache.js", () => ({ resetCache: mocks.reset }));
vi.mock("../src/prismaClient.js", () => ({
  default: { $disconnect: mocks.disconnect },
}));
vi.mock("../src/redisClient.js", () => ({
  connectRedis: mocks.connect,
  closeRedis: mocks.close,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

it("loads configuration, connects, resets, and closes both clients", async () => {
  await import("../src/resetCache.js");
  expect(mocks.load).toHaveBeenCalledOnce();
  expect(mocks.load.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.connect.mock.invocationCallOrder[0],
  );
  expect(mocks.connect.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.reset.mock.invocationCallOrder[0],
  );
  expect(mocks.reset.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.disconnect.mock.invocationCallOrder[0],
  );
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
});
it.each(["connect", "reset", "disconnect"] as const)(
  "cleans up Redis when %s fails",
  async (operation) => {
    mocks[operation].mockRejectedValue(new Error("failure"));
    await expect(import("../src/resetCache.js")).rejects.toThrow("failure");
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    if (operation === "connect") {
      expect(mocks.reset).not.toHaveBeenCalled();
    }
  },
);
