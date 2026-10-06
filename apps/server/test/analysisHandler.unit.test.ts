import z from "zod";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
  calculate: vi.fn(),
}));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.get, set: mocks.set },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: { cachedAnalysis: { create: mocks.create } },
}));
import { createAnalysisHandler } from "../src/handler/analysis/analysisHandler.js";
const base = {
  params: {
    body: z.object({ metric: z.number() }),
    query: z.object({ view: z.string() }),
    params: z.object({ team: z.string() }),
  },
  usesDataSource: true,
  shouldCache: true,
  createKey: () => ({
    key: ["metric"],
    teamDependencies: [254],
    tournamentDependencies: ["2026test"],
  }),
  calculateAnalysis: mocks.calculate,
};
const run = (
  overrides: Partial<Omit<typeof base, "shouldCache">> & {
    shouldCache?: boolean;
  } = {},
  requestOverrides: Parameters<typeof invoke>[1] = {},
) => {
  const { createKey, ...config } = { ...base, ...overrides };
  const handler = createAnalysisHandler(
    config.shouldCache === false
      ? { ...config, shouldCache: false }
      : { ...config, shouldCache: true, createKey },
  );
  return invoke((req, res) => handler(req, res, vi.fn()), {
    body: { metric: 1 },
    query: { view: "summary" },
    params: { team: "254" },
    ...requestOverrides,
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(null);
  mocks.calculate.mockResolvedValue({ score: 12 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it("validates all input locations and passes source context", async () => {
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.body).toEqual({ score: 12 });
  expect(mocks.calculate).toHaveBeenCalledWith(
    {
      body: { metric: 1 },
      query: { view: "summary" },
      params: { team: "254" },
    },
    {
      user: testUser,
      dataSource: {
        teams: testUser.teamSourceRule,
        tournaments: testUser.tournamentSourceRule,
      },
    },
  );
  expect(result.headers["X-Lovat-Cache"]).toBe("miss");
  const key =
    "analysis:v2:handler:test-user:metric:{INCLUDE:[8033]}:{EXCLUDE:[]}";
  expect(mocks.get).toHaveBeenCalledWith(key);
  expect(mocks.set).toHaveBeenCalledWith(key, '{"score":12}');
  expect(mocks.create).toHaveBeenCalledWith({
    data: {
      key,
      teamDependencies: [254],
      tournamentDependencies: ["2026test"],
    },
  });
});
it("handles handlers without schemas or source-dependent keys", async () => {
  const handler = createAnalysisHandler({
    params: {},
    usesDataSource: false,
    shouldCache: true,
    createKey: () => ({ key: ["plain"] }),
    calculateAnalysis: mocks.calculate,
  });
  const result = await invoke((req, res) => handler(req, res, vi.fn()));
  expect(result.statusCode).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith({
    data: {
      key: "analysis:v2:handler:test-user:plain",
      teamDependencies: [],
      tournamentDependencies: [],
    },
  });
});
it.each([null, undefined])(
  "calculates when cache is absent (%s)",
  async (value) => {
    mocks.get.mockResolvedValue(value);
    expect((await run()).statusCode).toBe(200);
    expect(mocks.calculate).toHaveBeenCalledOnce();
  },
);
it.each([{ score: 9 }, { error: "NO_DATA" }])(
  "returns cache hits without recalculating (%j)",
  async (value) => {
    mocks.get.mockResolvedValue(JSON.stringify(value));
    const result = await run();
    expect(result.body).toEqual("error" in value ? value.error : value);
    expect(result.headers["X-Lovat-Cache"]).toBe("hit");
    expect(mocks.calculate).not.toHaveBeenCalled();
  },
);
it.each([true, false])(
  "returns domain errors from calculations (%s caching)",
  async (shouldCache) => {
    mocks.calculate.mockResolvedValue({ error: "NO_DATA" });
    expect((await run({ shouldCache })).body).toBe("NO_DATA");
  },
);
it("bypasses Redis for uncached calculations", async () => {
  expect((await run({ shouldCache: false })).body).toEqual({ score: 12 });
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([true, false])(
  "reports calculation failures (%s caching)",
  async (shouldCache) => {
    mocks.calculate.mockRejectedValue(new Error("offline"));
    const result = await run({ shouldCache });
    expect(result.statusCode).toBe(500);
    expect(result.body).toBe("Error calculating analysis");
    expect(mocks.set).not.toHaveBeenCalled();
  },
);
it.each(["body", "query", "params"] as const)(
  "rejects invalid %s before cache access",
  async (field) => {
    expect((await run({}, { [field]: {} })).statusCode).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  },
);
it("fails closed on malformed source visibility", async () => {
  expect(
    (await run({}, { user: { ...testUser, teamSourceRule: null } })).statusCode,
  ).toBe(400);
  expect(mocks.calculate).not.toHaveBeenCalled();
});
it("reports Redis reads failing", async () => {
  mocks.get.mockRejectedValue(new Error("offline"));
  expect((await run()).statusCode).toBe(500);
  expect(mocks.calculate).not.toHaveBeenCalled();
});
it("reports malformed cached JSON", async () => {
  mocks.get.mockResolvedValue("invalid");
  expect((await run()).statusCode).toBe(500);
});
it("keeps a calculated response when Redis storage fails", async () => {
  mocks.set.mockRejectedValue(new Error("offline"));
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.body).toEqual({ score: 12 });
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ code: "P2002" }, new Error("offline"), null])(
  "keeps a calculated response on dependency registration failure (%j)",
  async (error) => {
    mocks.create.mockRejectedValue(error);
    expect((await run()).statusCode).toBe(200);
  },
);
