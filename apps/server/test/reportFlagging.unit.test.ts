import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";

const db = vi.hoisted(() => ({
  scoutReport: { findFirst: vi.fn(), update: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/lib/clearCache.js", () => ({ invalidateCache: db.invalidate }));
import { setScoutReportFlag } from "../src/handler/manager/scoutreports/setScoutReportFlag.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.scoutReport.findFirst.mockResolvedValue({
    uuid: "report",
    teamMatchData: { teamNumber: 254, tournamentKey: "2026test" },
  });
});
afterEach(() => vi.restoreAllMocks());

it.each([
  { params: {}, query: { flag: "true" } },
  { params: { report: "report" }, query: {} },
  { params: { report: "report" }, query: { flag: "invalid" } },
])(
  "rejects malformed flag requests before reading or writing reports (%j)",
  async (request) => {
    const response = await invoke(setScoutReportFlag, request);
    expect(response.statusCode).toBe(400);
    expect(db.scoutReport.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  },
);

it("does not flag missing or inaccessible reports", async () => {
  db.scoutReport.findFirst.mockResolvedValue(null);
  const response = await invoke(setScoutReportFlag, {
    params: { report: "report" },
    query: { flag: "true" },
  });
  expect(response.statusCode).toBe(404);
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(db.invalidate).not.toHaveBeenCalled();
});

it.each([
  ["UNVERIFIED", 2, "true", undefined],
  ["UNVERIFIED", 3, "true", "FLAGGED"],
  ["FLAGGED", 2, "false", "UNVERIFIED"],
  ["FLAGGED", 3, "false", undefined],
  ["VERIFIED", 3, "true", undefined],
  ["BAD_REPORT", 0, "false", undefined],
])(
  "preserves reliability rules for %s with %i remaining flags (flag=%s)",
  async (current, count, flag, next) => {
    db.scoutReport.update.mockResolvedValueOnce({
      reliability: current,
      _count: { flaggedBy: count },
    });
    const response = await invoke(setScoutReportFlag, {
      params: { report: "report" },
      query: { flag },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      flagged: flag === "true",
      flagCount: count,
    });
    expect(db.scoutReport.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: {
          flaggedBy:
            flag === "true"
              ? { connect: { id: testUser.id } }
              : { disconnect: { id: testUser.id } },
        },
      }),
    );
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.scoutReport.update.mock.invocationCallOrder[0],
    );
    if (next) {
      expect(db.scoutReport.update).toHaveBeenNthCalledWith(2, {
        where: { uuid: "report" },
        data: { reliability: next },
      });
    } else {
      expect(db.scoutReport.update).toHaveBeenCalledTimes(1);
    }
    expect(db.invalidate).toHaveBeenCalledWith(254, "2026test");
  },
);

it("does not invalidate cache or report success when saving reliability fails", async () => {
  db.scoutReport.update
    .mockResolvedValueOnce({
      reliability: "UNVERIFIED",
      _count: { flaggedBy: 3 },
    })
    .mockRejectedValueOnce(new Error("database"));
  const response = await invoke(setScoutReportFlag, {
    params: { report: "report" },
    query: { flag: "true" },
  });
  expect(response.statusCode).toBe(500);
  expect(db.invalidate).not.toHaveBeenCalled();
});
