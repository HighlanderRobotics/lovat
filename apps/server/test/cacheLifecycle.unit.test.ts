import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: { cachedAnalysis: { deleteMany: vi.fn(), findMany: vi.fn() } },
  client: {
    on: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    scanIterator: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
  create: vi.fn(),
}));
vi.mock("redis", () => ({ createClient: mocks.create }));
vi.mock("../src/prismaClient.js", () => ({ default: mocks.db }));
import { closeRedis, connectRedis, kv } from "../src/redisClient.js";
import { resetCache, invalidateCache } from "../src/lib/clearCache.js";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReturnValue(mocks.client);
  mocks.client.on.mockReturnValue(mocks.client);
  mocks.client.connect.mockResolvedValue(mocks.client);
  mocks.db.cachedAnalysis.findMany.mockResolvedValue([]);
  mocks.client.scanIterator.mockImplementation(async function* () {
    yield ["lovat:k"];
  });
  mocks.client.del.mockResolvedValue(1);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(async () => {
  await closeRedis();
  vi.restoreAllMocks();
});
it("opens Redis lazily, reuses the connection, and forwards all command arguments", async () => {
  await closeRedis();
  expect(mocks.create).not.toHaveBeenCalled();
  await kv.set("k", "v");
  await kv.get("k");
  await kv.del(["k"]);
  await kv.reset();
  await connectRedis();
  await kv.incr("counter");
  await kv.exp("counter", 20);
  await kv.setEx("alias", "1", 60);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.client.connect).toHaveBeenCalledTimes(1);
  expect(mocks.client.set).toHaveBeenCalledWith("lovat:k", "v");
  expect(mocks.client.set).toHaveBeenCalledWith("lovat:alias", "1", { EX: 60 });
  expect(mocks.client.expire).toHaveBeenCalledWith("lovat:counter", 20);
  const reportError = mocks.client.on.mock.calls[0][1];
  reportError(new Error("offline"));
  expect(console.log).toHaveBeenCalledWith(
    "Redis Client Error",
    expect.any(Error),
  );
});
it("closes and recreates connections when reused after shutdown", async () => {
  await kv.get("first");
  await closeRedis();
  await closeRedis();
  await kv.get("second");
  expect(mocks.client.quit).toHaveBeenCalledTimes(1);
  expect(mocks.client.connect).toHaveBeenCalledTimes(2);
});
it("resets only Redis keys and keeps metadata for late analysis writes", async () => {
  await resetCache();
  expect(mocks.db.cachedAnalysis.deleteMany).not.toHaveBeenCalled();
  expect(mocks.client.del).toHaveBeenCalledWith(["lovat:k"]);
});
it("does not delete Redis entries when no dependent analyses exist", async () => {
  await invalidateCache(254, "2026test");
  expect(mocks.db.cachedAnalysis.findMany).toHaveBeenCalledWith({
    where: {
      OR: [
        { teamDependencies: { has: 254 } },
        { tournamentDependencies: { has: "2026test" } },
      ],
    },
    select: { key: true },
  });
  expect(mocks.client.del).not.toHaveBeenCalled();
});
it("invalidates all dependent keys for arrays of teams and tournaments", async () => {
  mocks.db.cachedAnalysis.findMany.mockResolvedValue([
    { key: "a" },
    { key: "b" },
  ]);
  await invalidateCache([254, 971], ["2026test"]);
  expect(mocks.db.cachedAnalysis.findMany).toHaveBeenCalledWith({
    where: {
      OR: [
        { teamDependencies: { hasSome: [254, 971] } },
        { tournamentDependencies: { hasSome: ["2026test"] } },
      ],
    },
    select: { key: true },
  });
  expect(mocks.client.del).toHaveBeenCalledWith(["lovat:a", "lovat:b"]);
  expect(mocks.db.cachedAnalysis.deleteMany).toHaveBeenCalledWith({
    where: { key: { in: ["a", "b"] } },
  });
});
