import { beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
import {
  teamEstimates,
  teamEstimateSummary,
} from "../src/handler/analysis/teamLookUp/teamEstimates.js";
const row = (n: number, score: number, scout: number | null) => ({
  matchKey: `2026cacg_qm${n}`,
  teamNumber: 8033,
  tournamentKey: "2026cacg",
  tournamentName: "CalGames",
  matchNumber: n,
  setNumber: 1,
  competitionLevel: "QUALIFICATION",
  totalPoints: score,
  autoPoints: 5,
  teleopPoints: score - 5,
  totalFuel: score,
  scoutPoints: scout,
  inputOrigin: "LIVE",
});
beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([]);
});
it("shows estimates for a single match without applying predictor sample thresholds", async () => {
  db.$queryRaw.mockResolvedValue([row(3, 20, 25)]);
  const result = await teamEstimateSummary(testUser, 8033);
  expect(result).toMatchObject({
    scoreSource: "combined",
    sampleCount: 1,
    averagePoints: 20,
    scoutAverage: 25,
    ocrAdjustment: -5,
    autoPoints: 5,
    teleopPoints: 15,
  });
});
it("sorts match numbers numerically and preserves missing comparison baselines", async () => {
  db.$queryRaw.mockResolvedValue([row(10, 20, null), row(2, 30, 25)]);
  const result = await teamEstimateSummary(testUser, 8033);
  expect(result.matches.map((m) => m.label)).toEqual(["QM2", "QM10"]);
  expect(result.averagePoints).toBe(25);
  expect(result.scoutAverage).toBeNull();
  expect(result.ocrAdjustment).toBeNull();
  expect(result.matches[1].ocrAdjustment).toBeNull();
});
it("returns an explicit empty dataset without report-score fallback", async () => {
  expect(await teamEstimateSummary(testUser, 8033)).toMatchObject({
    sampleCount: 0,
    matches: [],
    averagePoints: null,
  });
});
it.each(["invalid", "-1", "0"])(
  "rejects invalid team input %s",
  async (team) => {
    expect(
      (
        await invoke((req, res) => teamEstimates(req, res, vi.fn()), {
          params: { team },
        })
      ).statusCode,
    ).toBe(400);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  },
);
