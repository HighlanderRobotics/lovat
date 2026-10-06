import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  team: { findMany: vi.fn().mockResolvedValue([]) },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  cachedAnalysis: { create: vi.fn() },
  event: { aggregate: vi.fn() },
  get: vi.fn(),
  set: vi.fn(),
  roles: vi.fn(),
  rankings: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({ kv: { get: db.get, set: db.set } }));
vi.mock("axios", () => ({ default: { get: db.rankings } }));
vi.mock("../src/handler/analysis/coreAnalysis/nonEventMetric.js", () => ({
  nonEventMetric: db.roles,
}));
import { rankFlag } from "../src/handler/analysis/rankFlag.js";
import { robotRole } from "../src/handler/analysis/coreAnalysis/robotRole.js";
import { totalPointsScoutingLead } from "../src/handler/analysis/scoutingLead/totalPointsScoutingLead.js";
beforeEach(() => {
  vi.resetAllMocks();
  db.get.mockResolvedValue(null);
  db.roles.mockResolvedValue({ DEFENSE: 2, SCORING: 5, FEEDING: 1 });
  db.event.aggregate.mockResolvedValue({ _sum: { points: 31 } });
  db.rankings.mockResolvedValue({
    data: { rankings: [{ team_key: "frc254", rank: 1 }] },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it("returns current event ranks and zero for unranked teams without caching", async () => {
  expect(
    await rankFlag(testUser, { eventKey: "2026test", teams: [254, 971] }),
  ).toEqual({ 254: 1, 971: 0 });
  expect(db.get).not.toHaveBeenCalled();
});
it("returns zero ranks if the external service is unavailable", async () => {
  db.rankings.mockRejectedValue(new Error("TBA"));
  expect(
    await rankFlag(testUser, { eventKey: "2026test", teams: [254] }),
  ).toEqual({ 254: 0 });
});
it("sorts robot roles by their observed frequency and caches per team", async () => {
  expect(await robotRole(testUser, { team: 254 })).toEqual({
    mainRoles: ["SCORING", "DEFENSE", "FEEDING"],
  });
  expect(db.cachedAnalysis.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        teamDependencies: [254],
        tournamentDependencies: [],
      }),
    }),
  );
});
it("returns no roles for an unscouted team", async () => {
  db.roles.mockResolvedValue({});
  expect(await robotRole(testUser, { team: 254 })).toEqual({ mainRoles: [] });
});
it("propagates robot role lookup errors", async () => {
  db.roles.mockRejectedValue(new Error("database"));
  await expect(robotRole(testUser, { team: 254 })).rejects.toThrow("database");
});
it.each([31, null])(
  "sums report points, defaulting missing aggregates to zero (%s)",
  async (points) => {
    db.event.aggregate.mockResolvedValue({ _sum: { points } });
    expect(
      await totalPointsScoutingLead(testUser, { scoutReportUuid: "report" }),
    ).toBe(points ?? 0);
    expect(db.event.aggregate).toHaveBeenCalledWith({
      where: { scoutReportUuid: "report" },
      _sum: { points: true },
    });
    expect(db.set).toHaveBeenCalledWith(
      expect.stringContaining("totalPointsScoutingLead:report"),
      JSON.stringify(points ?? 0),
    );
  },
);
