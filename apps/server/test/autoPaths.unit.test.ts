import { beforeEach, expect, it, vi } from "vitest";
import { testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  scoutReport: { findMany: vi.fn() },
  team: { findMany: vi.fn().mockResolvedValue([]) },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  cachedAnalysis: { create: vi.fn() },
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/redisClient.js", () => ({ kv: { get: db.get, set: db.set } }));
import { autoPathsTeam } from "../src/handler/analysis/autoPaths/autoPathsTeam.js";
import {
  FlippedActionMap,
  FlippedPositionMap,
  autoEnd,
} from "../src/handler/analysis/analysisConstants.js";
const event = (
  action: string,
  position: string,
  points: number,
  time = 10,
  quantity: number | null = null,
) => ({ action, position, points, time, quantity });
const report = (key: string, events: ReturnType<typeof event>[]) => ({
  teamMatchKey: key,
  teamMatchData: { tournament: { name: "Test event" } },
  events,
});
beforeEach(() => {
  vi.clearAllMocks();
  db.get.mockResolvedValue(null);
});
it("returns no paths without autonomous events", async () => {
  db.scoutReport.findMany.mockResolvedValue([report("m1", [])]);
  expect(await autoPathsTeam(testUser, { team: 254 })).toEqual([]);
});
it("groups compatible prefixes, retains the longest path and deduplicates match references", async () => {
  const start = event("START_MATCH", "HUB", 0, 0);
  const score = event("STOP_SCORING", "HUB", 8, 10, 8);
  const intake = event("INTAKE", "OUTPOST", 0, 15);
  db.scoutReport.findMany.mockResolvedValue([
    report("m1", [start]),
    report("m2", [start, score]),
    report("m2", [start, score]),
    report("m3", [start]),
    report("m4", [start, intake]),
  ]);
  const result = await autoPathsTeam(testUser, { team: 254 });
  expect(result).toEqual([
    {
      positions: [
        {
          location: FlippedPositionMap.HUB,
          event: FlippedActionMap.START_MATCH,
          time: 0,
          quantity: undefined,
        },
        {
          location: FlippedPositionMap.HUB,
          event: FlippedActionMap.STOP_SCORING,
          time: 10,
          quantity: 8,
        },
      ],
      matches: [
        { matchKey: "m1", tournamentName: "Test event" },
        { matchKey: "m2", tournamentName: "Test event" },
        { matchKey: "m3", tournamentName: "Test event" },
      ],
      score: [0, 8, 8, 0],
      frequency: 4,
      maxScore: 8,
    },
    {
      positions: [
        {
          location: FlippedPositionMap.HUB,
          event: FlippedActionMap.START_MATCH,
          time: 0,
          quantity: undefined,
        },
        {
          location: FlippedPositionMap.OUTPOST,
          event: FlippedActionMap.INTAKE,
          time: 15,
          quantity: undefined,
        },
      ],
      matches: [{ matchKey: "m4", tournamentName: "Test event" }],
      score: [0],
      frequency: 1,
      maxScore: 0,
    },
  ]);
  expect(db.scoutReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        teamMatchData: { teamNumber: 254, tournamentKey: undefined },
        scouter: { sourceTeamNumber: { in: [8033] } },
      },
      select: expect.objectContaining({
        events: { where: { time: { lte: autoEnd } } },
      }),
    }),
  );
  expect(db.get).toHaveBeenCalledWith(
    expect.stringContaining("autoPathsTeam:254"),
  );
});
it("separates paths with different starting locations", async () => {
  db.scoutReport.findMany.mockResolvedValue([
    report("m1", [event("INTAKE", "HUB", 0)]),
    report("m2", [event("INTAKE", "OUTPOST", 0)]),
  ]);
  expect(await autoPathsTeam(testUser, { team: 254 })).toHaveLength(2);
});
