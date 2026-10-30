import { beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  match: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
import {
  matchEstimateDetails,
  matchEstimates,
  readOcrTimeline,
  ocrMatchResponse,
} from "../src/handler/analysis/teamLookUp/matchEstimates.js";
const sample = (time: number, count: number) => ({
  time,
  count,
  confidence: 95,
});
const fixture = () => ({
  key: "2026test_qm1",
  tournament: { name: "Synthetic" },
  scoreboardOcr: {
    status: "PARTIAL",
    observations: [],
    channels: {
      red: [sample(0, 0), sample(20, 5), sample(30, 10)],
      blue: [sample(0, 0), sample(23, 7)],
    },
  },
  alliances: [
    { color: "RED", score: 50 },
    { color: "BLUE", score: 40 },
  ],
  teamSlots: [
    { teamNumber: 8033, alliance: "RED", station: 1 },
    { teamNumber: 1967, alliance: "BLUE", station: 1 },
  ],
});
beforeEach(() => {
  vi.clearAllMocks();
  db.match.findUnique.mockResolvedValue(fixture());
  db.$queryRaw.mockResolvedValue([]);
});
it("keeps independently observed timelines and masks unavailable source estimates", async () => {
  db.$queryRaw.mockResolvedValue([
    {
      matchKey: "2026test_qm1",
      teamNumber: 8033,
      scoutPoints: 20,
      totalPoints: 15,
    },
  ]);
  const result = ocrMatchResponse.parse(
    await matchEstimateDetails(testUser, "2026test_qm1"),
  );
  expect(result).toMatchObject({
    available: true,
    label: "QM1",
    redScore: 50,
    blueScore: 40,
    timeline: {
      red: [sample(0, 0), sample(20, 5), sample(30, 10)],
      blue: [sample(0, 0), sample(23, 7)],
    },
  });
  expect(result.teams?.find((t) => t.teamNumber === 8033)).toMatchObject({
    scoutAverage: 20,
    ocrAdjustment: -5,
    totalPoints: 15,
  });
  expect(result.teams?.find((t) => t.teamNumber === 1967)).toMatchObject({
    scoutAverage: null,
    ocrAdjustment: null,
    totalPoints: null,
  });
});
it("does not fetch hidden tournaments", async () => {
  const user = {
    ...testUser,
    tournamentSourceRule: { mode: "INCLUDE", items: ["other"] },
  };
  expect(await matchEstimateDetails(user, "2026test_qm1")).toEqual({
    available: false,
    matchKey: "2026test_qm1",
  });
  expect(db.match.findUnique).not.toHaveBeenCalled();
  expect(db.$queryRaw).not.toHaveBeenCalled();
});
it("does not expose rejected or absent OCR", async () => {
  db.match.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
    ...fixture(),
    scoreboardOcr: { ...fixture().scoreboardOcr, status: "REJECTED" },
  });
  for (let i = 0; i < 2; i++)
    expect(await matchEstimateDetails(testUser, "2026test_qm1")).toMatchObject({
      available: false,
    });
  expect(db.$queryRaw).not.toHaveBeenCalled();
});
it("uses legacy paired samples only when independent channels are absent", () => {
  const paired = [{ time: 0, red: 2, blue: 3, confidence: 95 }];
  expect(readOcrTimeline(paired, null)).toEqual({
    red: [sample(0, 2)],
    blue: [sample(0, 3)],
  });
  expect(
    readOcrTimeline(paired, { red: [sample(0, 2), sample(0, 4)], blue: [] }),
  ).toEqual({ red: [], blue: [] });
  expect(
    readOcrTimeline([{ time: -1, red: 2, blue: 3, confidence: 95 }], null),
  ).toEqual({ red: [], blue: [] });
});
it.each(["2026test_qm0", "2026test_qm1/secret", "other", "2025test_qm1"])(
  "rejects invalid OCR match key %s",
  async (key) => {
    const result = await invoke(
      (req, res) => matchEstimates(req, res, vi.fn()),
      { params: { matchKey: key } },
    );
    expect(result.statusCode).toBe(400);
    expect(db.match.findUnique).not.toHaveBeenCalled();
  },
);
