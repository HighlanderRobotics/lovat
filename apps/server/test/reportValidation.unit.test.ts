import { beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  scoutReport: { findFirst: vi.fn(), update: vi.fn() },
  reportValidationFlag: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
  event: { update: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/lib/clearCache.js", () => ({ invalidateCache: db.invalidate }));
import {
  getReportValidation,
  reviewReportValidation,
} from "../src/handler/validation/reportValidation.js";
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.scoutReport.findFirst.mockResolvedValue({
    uuid: "report",
    scouter: { sourceTeamNumber: 8033 },
    teamMatchData: { teamNumber: 118, tournamentKey: "2026joh" },
    validationFlags: [],
    events: [],
    analysisExcluded: false,
  });
  db.reportValidationFlag.findFirst.mockResolvedValue({
    uuid: "flag",
    eventUuid: "event",
  });
  db.reportValidationFlag.count.mockResolvedValue(1);
});
it("reads raw events with source filters and exposes same-team lead review", async () => {
  const result = await invoke(getReportValidation, {
    params: { uuid: "report" },
  });
  expect(result.body).toMatchObject({ canReview: true, flags: [], events: [] });
  expect(db.scoutReport.findFirst.mock.calls[0][0].where).toMatchObject({
    uuid: "report",
    scouter: { sourceTeamNumber: { in: [8033] } },
  });
});
it.each([{ teamNumber: 971 }, { role: "SCOUTER" }, { tokenType: "apiKey" }])(
  "rejects unauthorized strike changes %j",
  async (override) => {
    if ("teamNumber" in override) {
      db.scoutReport.findFirst.mockResolvedValue(null);
    }
    const result = await invoke(reviewReportValidation, {
      params: { uuid: "report", flagUuid: "flag" },
      body: { status: "ACTIVE" },
      ...("tokenType" in override
        ? override
        : { user: { ...testUser, ...override } }),
    } as any);
    if ("teamNumber" in override) {
      expect(result.statusCode).toBe(404);
      expect(db.reportValidationFlag.update).not.toHaveBeenCalled();
      expect(
        db.scoutReport.findFirst.mock.calls[0][0].where.scouter
          .sourceTeamNumber,
      ).toBe(971);
    } else {
      expect(result.statusCode).toBe(403);
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  },
);
it("rejects invalid review values and missing reports without writes", async () => {
  expect(
    (await invoke(reviewReportValidation, { body: { status: "DELETE" } }))
      .statusCode,
  ).toBe(400);
  db.scoutReport.findFirst.mockResolvedValue(null);
  expect(
    (await invoke(reviewReportValidation, { body: { status: "ACTIVE" } }))
      .statusCode,
  ).toBe(404);
  expect(db.reportValidationFlag.update).not.toHaveBeenCalled();
});
it("locks the report, applies a strike and invalidates affected metrics", async () => {
  const result = await invoke(reviewReportValidation, {
    params: { uuid: "report", flagUuid: "flag" },
    body: { status: "ACTIVE" },
  });
  expect(result.statusCode).toBe(200);
  expect(db.$queryRaw).toHaveBeenCalled();
  expect(db.event.update).toHaveBeenCalledWith({
    where: { eventUuid: "event", scoutReportUuid: "report" },
    data: { analysisExcluded: true },
  });
  expect(db.invalidate).toHaveBeenCalledWith(118, "2026joh");
});
it("restores an event only after every active strike is gone", async () => {
  db.reportValidationFlag.count.mockResolvedValue(0);
  await invoke(reviewReportValidation, {
    params: { uuid: "report", flagUuid: "flag" },
    body: { status: "RESTORED" },
  });
  expect(db.event.update).toHaveBeenCalledWith({
    where: { eventUuid: "event", scoutReportUuid: "report" },
    data: { analysisExcluded: false },
  });
  expect(db.reportValidationFlag.update.mock.calls[0][0].data).toMatchObject({
    status: "RESTORED",
    reviewedBy: testUser.id,
  });
});
it("supports whole-report restoration without deleting raw data", async () => {
  db.reportValidationFlag.findFirst.mockResolvedValue({
    uuid: "flag",
    eventUuid: null,
  });
  db.reportValidationFlag.count.mockResolvedValue(0);
  await invoke(reviewReportValidation, {
    params: { uuid: "report", flagUuid: "flag" },
    body: { status: "RESTORED" },
  });
  expect(db.scoutReport.update).toHaveBeenCalledWith({
    where: { uuid: "report" },
    data: { analysisExcluded: false },
  });
  expect(db.event.update).not.toHaveBeenCalled();
});
