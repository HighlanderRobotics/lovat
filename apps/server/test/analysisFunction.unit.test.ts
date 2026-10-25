import z from "zod";
import type { User } from "@lovat/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: mocks.get, set: mocks.set },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: { cachedAnalysis: { create: mocks.create } },
}));
const { runAnalysis, createAnalysisFunction } =
  await import("../src/handler/analysis/analysisFunction.js");
const user: User = {
  id: "analysis-user",
  username: null,
  email: "test@example.invalid",
  emailVerified: true,
  teamNumber: 8033,
  role: "ANALYST",
  teamSourceRule: { mode: "INCLUDE", items: [8033] },
  tournamentSourceRule: { mode: "EXCLUDE", items: ["private"] },
};
const calculate = vi.fn();
const key = vi.fn(() => ({
  key: ["test"],
  teamDependencies: [254],
  tournamentDependencies: ["test-tournament"],
}));
const config = {
  argsSchema: z.object({ team: z.number() }),
  createKey: key,
  calculateAnalysis: calculate,
  usesDataSource: true,
  shouldCache: true as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(null);
  mocks.set.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(undefined);
  calculate.mockResolvedValue({ score: 1.2345 });
});

describe("analysis result caching", () => {
  it("rounds nested values, replaces non-finite numbers, and preserves other values", async () => {
    calculate.mockResolvedValue({
      values: [1.2345, NaN, Infinity, -Infinity],
      child: { value: 3.456 },
      none: null,
      missing: undefined,
      label: "test",
      enabled: true,
    });
    expect(
      await runAnalysis({ ...config, shouldCache: false }, user, { team: 254 }),
    ).toEqual({
      values: [1.23, 0, 0, 0],
      child: { value: 3.46 },
      none: null,
      missing: undefined,
      label: "test",
      enabled: true,
    });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();
  });
  it("uses fail-closed source rules for malformed user settings", async () => {
    await runAnalysis(
      { ...config, shouldCache: false },
      { ...user, teamSourceRule: null, tournamentSourceRule: null },
      { team: 254 },
    );
    expect(calculate).toHaveBeenCalledWith(
      { team: 254 },
      expect.objectContaining({
        dataSource: {
          teams: { mode: "INCLUDE", items: [] },
          tournaments: { mode: "INCLUDE", items: [] },
        },
      }),
    );
  });
  it("stores rounded results and registers dependencies with a viewer-specific key", async () => {
    expect(await createAnalysisFunction(config)(user, { team: 254 })).toEqual({
      score: 1.23,
    });
    const cacheKey =
      "analysis:v2:function:analysis-user:test:{INCLUDE:[8033]}:{EXCLUDE:[private]}";
    expect(mocks.get).toHaveBeenCalledWith(cacheKey);
    expect(mocks.set).toHaveBeenCalledWith(cacheKey, '{"score":1.23}');
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        key: cacheKey,
        teamDependencies: [254],
        tournamentDependencies: ["test-tournament"],
      },
    });
  });
  it("does not append source settings for functions that do not use them", async () => {
    await runAnalysis(
      {
        ...config,
        usesDataSource: false,
        createKey: () => ({ key: ["test"] }),
      },
      user,
      { team: 254 },
    );
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        key: "analysis:v2:function:analysis-user:test",
        teamDependencies: [],
        tournamentDependencies: [],
      },
    });
  });
  it("recalculates results instead of reusing entries from the old formula version", async () => {
    mocks.get.mockImplementation(async (key: string) =>
      key.startsWith("analysis:function:") ? '{"score":999}' : null,
    );
    expect(await runAnalysis(config, user, { team: 254 })).toEqual({
      score: 1.23,
    });
    expect(calculate).toHaveBeenCalledOnce();
  });
  it("uses valid cached results without calculating again", async () => {
    mocks.get.mockResolvedValue('{"score":2.5}');
    expect(
      await runAnalysis(
        { ...config, returnSchema: z.object({ score: z.number() }) },
        user,
        { team: 254 },
      ),
    ).toEqual({ score: 2.5 });
    expect(calculate).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("replaces a cached value whose shape no longer matches the response schema", async () => {
    mocks.get.mockResolvedValue('{"score":"outdated"}');
    expect(
      await runAnalysis(
        { ...config, returnSchema: z.object({ score: z.number() }) },
        user,
        { team: 254 },
      ),
    ).toEqual({ score: 1.23 });
    expect(calculate).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.any(String),
      '{"score":1.23}',
    );
  });
  it("allows a cached result when no response schema is specified", async () => {
    mocks.get.mockResolvedValue('{"score":9}');
    expect(await runAnalysis(config, user, { team: 254 })).toEqual({
      score: 9,
    });
    expect(calculate).not.toHaveBeenCalled();
  });
  it("tolerates another request registering the same key", async () => {
    mocks.create.mockRejectedValueOnce({ code: "P2002" });
    expect(await runAnalysis(config, user, { team: 254 })).toEqual({
      score: 1.23,
    });
  });
  it("propagates database failures other than duplicate-key conflicts", async () => {
    mocks.create.mockRejectedValueOnce(new Error("database offline"));
    await expect(runAnalysis(config, user, { team: 254 })).rejects.toThrow(
      "database offline",
    );
  });
  it("does not cache a failed calculation", async () => {
    calculate.mockRejectedValueOnce(new Error("not enough data"));
    await expect(runAnalysis(config, user, { team: 254 })).rejects.toThrow(
      "not enough data",
    );
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
