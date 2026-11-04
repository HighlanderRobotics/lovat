import { beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const mocks = vi.hoisted(() => ({
  team: { findMany: vi.fn().mockResolvedValue([]) },
  tournament: { findMany: vi.fn().mockResolvedValue([]) },
  match: { findMany: vi.fn() },
  scoutReport: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: mocks }));
import { getOcrCSV } from "../src/handler/analysis/csv/getOcrCSV.js";
import {
  addResultColumns,
  currentWinStreak,
  pointTrend,
} from "../src/handler/analysis/csv/tournamentResults.js";
const match = (n: number) => ({
  key: `2026test_qm${n}`,
  tournamentKey: "2026test",
  competitionLevel: "QUALIFICATION",
  displayOrder: n,
  setNumber: 1,
  matchNumber: n,
  status: "COMPLETED",
  winningAlliance: n === 6 ? "BLUE" : "RED",
  alliances: [
    { color: "RED", score: 20 },
    { color: "BLUE", score: 10 },
  ],
  teamSlots: [
    { teamNumber: 118, alliance: "RED" },
    { teamNumber: 254, alliance: "BLUE" },
  ],
});
const estimate = (n: number, points: number) => ({
  matchKey: `2026test_qm${n}`,
  tournamentKey: "2026test",
  teamNumber: 118,
  totalPoints: points,
  autoPoints: 0,
  teleopPoints: points,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.match.findMany.mockResolvedValue([match(1), match(2)]);
  mocks.$queryRaw.mockResolvedValue([estimate(1, 0)]);
  mocks.scoutReport.findMany.mockResolvedValue([]);
});
it("exports ordered match columns and team rows, preserving zero and missing cells", async () => {
  const result = await invoke(getOcrCSV, {
    query: { tournamentKey: "2026test" },
  });
  expect(result.statusCode).toBe(200);
  expect(result.body).toBe("\uFEFFteamNumber,QM1,QM2\n118,0,\n254,,\n");
});
it("exports schedule with no estimates and validates queries", async () => {
  mocks.$queryRaw.mockResolvedValue([]);
  expect(
    (await invoke(getOcrCSV, { query: { tournamentKey: "2026test" } })).body,
  ).toBe("\uFEFFteamNumber,QM1,QM2\n118,,\n254,,\n");
  expect(
    (await invoke(getOcrCSV, { query: { tournamentKey: "../../secret" } }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await invoke(getOcrCSV, {
        query: { tournamentKey: "2026test", fixedPoints: "nope" },
      })
    ).statusCode,
  ).toBe(400);
});
it("denies excluded tournaments before reading data and binds source filters", async () => {
  expect(
    (
      await invoke(getOcrCSV, {
        query: { tournamentKey: "2026test" },
        user: {
          ...testUser,
          tournamentSourceRule: { mode: "INCLUDE", items: [] },
        },
      })
    ).statusCode,
  ).toBe(403);
  expect(mocks.match.findMany).not.toHaveBeenCalled();
  await invoke(getOcrCSV, { query: { tournamentKey: "2026test" } });
  expect(mocks.$queryRaw.mock.calls[0].slice(1)).toContainEqual([8033]);
});
it("selects auto or teleop estimates", async () => {
  mocks.$queryRaw.mockResolvedValue([
    { ...estimate(1, 30), autoPoints: 10, teleopPoints: 20 },
  ]);
  expect(
    String(
      (
        await invoke(getOcrCSV, {
          query: { tournamentKey: "2026test", auto: "" },
        })
      ).body,
    ),
  ).toContain("118,10,");
  expect(
    String(
      (
        await invoke(getOcrCSV, {
          query: { tournamentKey: "2026test", teleop: "" },
        })
      ).body,
    ),
  ).toContain("118,20,");
});
it("leaves legacy columns unchanged without extra reads", async () => {
  const rows = [{ teamNumber: 118 }];
  expect(
    await addResultColumns(
      rows,
      testUser,
      { tournamentKey: "2026test", fixedPoints: "false" },
      true,
      true,
    ),
  ).toBe(rows);
  expect(mocks.match.findMany).not.toHaveBeenCalled();
});
it("averages available estimates, keeps missing values blank and uses official wins", async () => {
  mocks.$queryRaw.mockResolvedValue([estimate(1, 0), estimate(2, 20)]);
  expect(
    await addResultColumns(
      [{ teamNumber: 118 }, { teamNumber: 254 }],
      testUser,
      { tournamentKey: "2026test", fixedPoints: "true", winstreak: "true" },
      true,
      true,
    ),
  ).toEqual([
    { teamNumber: 118, fixedPoints: 10, winstreak: 2 },
    { teamNumber: 254, fixedPoints: null, winstreak: 0 },
  ]);
});
it("report columns reflect the report match rather than future matches", async () => {
  mocks.match.findMany.mockResolvedValue(
    Array.from({ length: 6 }, (_, i) => match(i + 1)),
  );
  mocks.$queryRaw.mockResolvedValue([estimate(1, 5), estimate(6, 99)]);
  expect(
    await addResultColumns(
      [{ teamNumber: 118, match: "Q1" }],
      testUser,
      { tournamentKey: "2026test", fixedPoints: "true", winstreak: "true" },
      true,
      true,
      ["2026test_qm1"],
    ),
  ).toEqual([{ teamNumber: 118, match: "Q1", fixedPoints: 5, winstreak: 1 }]);
});
it("uses per-match averages for trend and requires six complete matches", async () => {
  mocks.match.findMany.mockResolvedValue(
    Array.from({ length: 6 }, (_, i) => match(i + 1)),
  );
  mocks.scoutReport.findMany.mockResolvedValue(
    Array.from({ length: 6 }, (_, i) =>
      [10, 30].map((points) => ({
        accuracy: null,
        autoClimb: "NONE",
        endgameClimb: "NOT_ATTEMPTED",
        teamMatchData: { teamNumber: 118, matchKey: `2026test_qm${i + 1}` },
        events: [
          {
            action: "STOP_SCORING",
            time: 30,
            points: points + (i >= 3 ? 10 : 0),
          },
        ],
      })),
    ).flat(),
  );
  expect(
    (
      await addResultColumns(
        [{ teamNumber: 118 }],
        testUser,
        { tournamentKey: "2026test", trend: "true" },
        true,
        true,
      )
    )[0],
  ).toHaveProperty("trend", 10);
  expect(pointTrend([0, 0, 0, 0, 0, null])).toBeNull();
  expect(pointTrend([1, 2])).toBeNull();
  expect(pointTrend([0, 0, 0, 0, 0, 0])).toBe(0);
  expect(currentWinStreak([])).toBeNull();
  expect(currentWinStreak(["WIN", "UNKNOWN"])).toBeNull();
  expect(currentWinStreak(["WIN", "TIE", "WIN"])).toBe(1);
});
