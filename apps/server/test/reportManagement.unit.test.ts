import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  scoutReport: { findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  event: { findMany: vi.fn(), deleteMany: vi.fn() },
  invalidate: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/lib/clearCache.js", () => ({ invalidateCache: db.invalidate }));
import { getScoutReport } from "../src/handler/manager/scoutreports/getScoutReport.js";
import { deleteScoutReport } from "../src/handler/manager/scoutreports/deleteScoutReport.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.scoutReport.findFirst.mockResolvedValue({
    uuid: "report",
    scouter: { name: "Scout", sourceTeamNumber: 8033 },
  });
  db.event.findMany.mockResolvedValue([{ time: 0 }]);
  db.scoutReport.findUnique.mockResolvedValue({
    scouter: { sourceTeamNumber: 8033 },
  });
  db.scoutReport.delete.mockResolvedValue({
    teamMatchData: { teamNumber: 254, tournamentKey: "2026test" },
  });
});
afterEach(() => vi.restoreAllMocks());
for (const handler of [getScoutReport, deleteScoutReport]) {
  it(`${handler.name} validates report identifiers`, async () => {
    expect((await invoke(handler)).statusCode).toBe(400);
  });
  it(`${handler.name} reports failed database lookups`, async () => {
    db.scoutReport.findFirst.mockRejectedValue(new Error("database"));
    db.scoutReport.findUnique.mockRejectedValue(new Error("database"));
    expect(
      (await invoke(handler, { params: { uuid: "report" } })).statusCode,
    ).toBe(500);
  });
  it(`${handler.name} returns not found for unavailable reports`, async () => {
    db.scoutReport.findFirst.mockResolvedValue(null);
    db.scoutReport.findUnique.mockResolvedValue(null);
    expect(
      (await invoke(handler, { params: { uuid: "report" } })).statusCode,
    ).toBe(404);
  });
}
it.each([
  [testUser, true, "Scout"],
  [{ ...testUser, role: "ANALYST" as const }, false, "Scout"],
  [{ ...testUser, teamNumber: 971 }, false, undefined],
  [{ ...testUser, teamNumber: null }, false, undefined],
])(
  "keeps report modification rights and scouter names team-scoped %j",
  async (user, canModify, scouterName) => {
    expect(
      (await invoke(getScoutReport, { user, params: { uuid: "report" } })).body,
    ).toEqual({
      scoutReport: { uuid: "report", scouterName },
      events: [{ time: 0 }],
      canModify,
    });
  },
);
it("blocks report deletion using API tokens", async () => {
  expect(
    (
      await invoke(deleteScoutReport, {
        tokenType: "apiKey",
        params: { uuid: "report" },
      })
    ).statusCode,
  ).toBe(403);
});
it.each([
  { ...testUser, role: "ANALYST" as const },
  { ...testUser, teamNumber: 971 },
])(
  "denies report deletion without leadership on the source team %j",
  async (user) => {
    expect(
      (await invoke(deleteScoutReport, { user, params: { uuid: "report" } }))
        .statusCode,
    ).toBe(403);
    expect(db.event.deleteMany).not.toHaveBeenCalled();
  },
);
it("deletes events and report before invalidating dependent analyses", async () => {
  expect(
    (await invoke(deleteScoutReport, { params: { uuid: "report" } }))
      .statusCode,
  ).toBe(200);
  expect(db.event.deleteMany).toHaveBeenCalledWith({
    where: { scoutReportUuid: "report" },
  });
  expect(db.invalidate).toHaveBeenCalledWith(254, "2026test");
});
