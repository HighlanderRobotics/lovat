import { expect, it, vi } from "vitest";
import { testUser } from "./helpers/handlerHarness.js";

const db = vi.hoisted(() => ({
  team: { findMany: vi.fn() },
  tournament: { findMany: vi.fn() },
  cachedAnalysis: { findUnique: vi.fn(), create: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({
  kv: { get: db.get, set: db.set },
}));

import {
  getAllTeamNumbers,
  getAllTournaments,
  Metric,
} from "../src/handler/analysis/analysisConstants.js";
import { averageAllTeamFast } from "../src/handler/analysis/coreAnalysis/averageAllTeamFast.js";

it("only checks the registration on a warm population metric cache hit", async () => {
  expect(db.team.findMany).not.toHaveBeenCalled();
  expect(db.tournament.findMany).not.toHaveBeenCalled();
  db.get.mockResolvedValueOnce("1.25");
  db.cachedAnalysis.findUnique.mockResolvedValueOnce({ key: "registered" });

  expect(
    await averageAllTeamFast(testUser, { metric: Metric.driverAbility }),
  ).toBe(1.25);

  expect(db.cachedAnalysis.findUnique).toHaveBeenCalledOnce();
  expect(db.team.findMany).not.toHaveBeenCalled();
  expect(db.tournament.findMany).not.toHaveBeenCalled();
  expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  expect(db.cachedAnalysis.create).not.toHaveBeenCalled();
});

it("loads team dependencies only when registering a computed result and retries catalog failures", async () => {
  db.get.mockResolvedValue(null);
  db.$queryRawUnsafe.mockResolvedValue([]);
  db.team.findMany
    .mockRejectedValueOnce(new Error("catalog temporarily unavailable"))
    .mockResolvedValueOnce([{ number: 254 }, { number: 8033 }]);

  await expect(getAllTeamNumbers()).rejects.toThrow(
    "catalog temporarily unavailable",
  );
  expect(
    await averageAllTeamFast(testUser, { metric: Metric.driverAbility }),
  ).toBe(0);
  expect(db.cachedAnalysis.create).toHaveBeenCalledExactlyOnceWith({
    data: {
      key: expect.stringContaining("averageAllTeamFast"),
      teamDependencies: [254, 8033],
      tournamentDependencies: [],
    },
  });
  expect(await getAllTeamNumbers()).toEqual([254, 8033]);
  expect(db.team.findMany).toHaveBeenCalledTimes(2);
});

it("loads and shares the ordered tournament catalog on demand", async () => {
  db.tournament.findMany.mockResolvedValue([{ key: "2026test" }]);
  const first = getAllTournaments();
  expect(getAllTournaments()).toBe(first);
  expect(await first).toEqual(["2026test"]);
  expect(db.tournament.findMany).toHaveBeenCalledExactlyOnceWith({
    select: { key: true },
    orderBy: [{ date: "asc" }],
  });
});
