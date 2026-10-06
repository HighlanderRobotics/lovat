import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@lovat/db";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  scouter: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
  teamMatchData: { findFirst: vi.fn() },
  scoutReport: { create: vi.fn() },
  event: { createMany: vi.fn() },
  $transaction: vi.fn(),
  importMatches: vi.fn(),
  invalidate: vi.fn(),
  totalPoints: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/lib/clearCache.js", () => ({ invalidateCache: db.invalidate }));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: db.importMatches,
}));
vi.mock(
  "../src/handler/analysis/scoutingLead/totalPointsScoutingLead.js",
  () => ({ totalPointsScoutingLead: db.totalPoints }),
);
vi.mock("../src/handler/slack/sendWarningNotification.js", () => ({
  sendWarningToSlack: db.warn,
}));
import {
  addScoutReport,
  checkForInvalidEvents,
} from "../src/handler/manager/scoutreports/addScoutReport.js";
import { addScoutReportDashboard } from "../src/handler/manager/scoutreports/addScoutReportDashboard.js";
const body = () => ({
  uuid: "report",
  tournamentKey: "2026test",
  matchType: "QUALIFICATION",
  matchNumber: 1,
  startTime: Date.UTC(2026, 0, 1),
  notes: "Synthetic report",
  robotRoles: ["SCORING"],
  mobility: "NONE",
  beached: "NEITHER",
  feederTypes: [],
  intakeType: "NEITHER",
  driverAbility: 3,
  accuracy: null,
  disrupts: false,
  defenseEffectiveness: 0,
  scoresWhileMoving: false,
  autoClimb: "NOT_ATTEMPTED",
  endgameClimb: "NOT_ATTEMPTED",
  scouterUuid: "scout",
  teamNumber: 254,
  events: [
    [0, 2, 8],
    [10, 0, 2],
    [20, 1, 2, 3],
  ],
});
const run = (overrides = {}) =>
  invoke(addScoutReportDashboard, { body: { ...body(), ...overrides } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  db.$transaction.mockImplementation((operations: unknown[]) =>
    Promise.all(operations),
  );
  db.invalidate.mockResolvedValue(undefined);
  db.scouter.findFirstOrThrow.mockResolvedValue({ uuid: "scout" });
  db.scouter.findFirst.mockResolvedValue({
    uuid: "scout",
    sourceTeamNumber: 8033,
  });
  db.teamMatchData.findFirst.mockResolvedValue({
    key: "2026test_qm1_0",
    matchNumber: 1,
    teamNumber: 254,
    tournamentKey: "2026test",
  });
});
afterEach(() => vi.restoreAllMocks());
it("stores dashboard reports, maps scoring quantities, and recalculates totals", async () => {
  expect((await run()).statusCode).toBe(200);
  expect(db.scoutReport.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        teamMatchData: { connect: { key: "2026test_qm1_0" } },
        scouter: { connect: { uuid: "scout" } },
        accuracy: null,
        robotBrokeDescription: null,
      }),
    }),
  );
  expect(db.event.createMany).toHaveBeenCalledWith({
    data: [
      {
        time: 0,
        action: "START_MATCH",
        position: "NONE",
        points: 0,
        quantity: 0,
        scoutReportUuid: "report",
      },
      {
        time: 10,
        action: "START_SCORING",
        position: "HUB",
        points: 0,
        quantity: 0,
        scoutReportUuid: "report",
      },
      {
        time: 20,
        action: "STOP_SCORING",
        position: "HUB",
        points: 3,
        quantity: 3,
        scoutReportUuid: "report",
      },
    ],
  });
  expect(db.invalidate).toHaveBeenCalledWith(254, "2026test");
  expect(db.totalPoints).toHaveBeenCalledWith(testUser, {
    scoutReportUuid: "report",
  });
  expect(db.warn).not.toHaveBeenCalled();
});
it("records feeding quantities and sends a break warning", async () => {
  expect(
    (
      await run({
        accuracy: 80,
        robotBrokeDescription: " broken wheel ",
        events: [
          [0, 2, 8],
          [30, 12, 2],
          [40, 13, 2, 8],
        ],
      })
    ).statusCode,
  ).toBe(200);
  expect(db.warn).toHaveBeenCalledWith("BREAK", 1, 254, "2026test", "report");
  expect(db.event.createMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: "STOP_FEEDING",
          quantity: 8,
          points: 0,
        }),
      ]),
    }),
  );
});
it("blocks API key submissions", async () => {
  expect(
    (await invoke(addScoutReportDashboard, { tokenType: "apiKey" })).statusCode,
  ).toBe(403);
  expect(db.scoutReport.create).not.toHaveBeenCalled();
});
it("rejects malformed report fields", async () => {
  expect((await run({ teamNumber: "bad" })).statusCode).toBe(400);
  expect(db.scoutReport.create).not.toHaveBeenCalled();
});
it("rejects deleted scouters", async () => {
  db.scouter.findFirst.mockResolvedValue(null);
  expect((await run()).statusCode).toBe(400);
});
it.each([null, 971])(
  "rejects reports outside the submitting user's team %s",
  async (teamNumber) => {
    expect(
      (
        await invoke(addScoutReportDashboard, {
          body: body(),
          user: { ...testUser, teamNumber },
        })
      ).statusCode,
    ).toBe(401);
    expect(db.scoutReport.create).not.toHaveBeenCalled();
  },
);
it("imports missing match data before retrying the target row", async () => {
  db.teamMatchData.findFirst.mockResolvedValueOnce(null);
  expect((await run()).statusCode).toBe(200);
  expect(db.importMatches).toHaveBeenCalledWith("2026test");
});
it("returns not found when importing does not provide the target match", async () => {
  db.teamMatchData.findFirst.mockResolvedValue(null);
  expect((await run()).statusCode).toBe(404);
  expect(db.scoutReport.create).not.toHaveBeenCalled();
});
it("rejects invalid event timelines before persistence", async () => {
  expect((await run({ events: [[0, 2, 99]] })).statusCode).toBe(400);
  expect(db.scoutReport.create).not.toHaveBeenCalled();
});
it.each(["P2025", "P2002"])(
  "translates Prisma %s failures into client errors",
  async (code) => {
    db.scoutReport.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("synthetic", {
        code,
        clientVersion: "test",
      }),
    );
    expect((await run()).statusCode).toBe(400);
    expect(db.event.createMany).not.toHaveBeenCalled();
  },
);
it("reports unexpected persistence failures", async () => {
  db.event.createMany.mockRejectedValue(new Error("database"));
  expect((await run()).statusCode).toBe(500);
});
it.each(
  [
    [
      [10, 0, 2],
      [20, 13, 2, 5],
    ],
    [[20, 1, 2, 5]],
    [[10, 0, 2]],
    [
      [10, 0, 2],
      [20, 12, 2],
    ],
  ].map((events) => [events]),
)("rejects unpaired and mismatched event transitions %j", (events) => {
  expect(checkForInvalidEvents(events)).toEqual(
    expect.arrayContaining([expect.any(String)]),
  );
});
it("dashboard rejects overlapping event actions before creating a report", async () => {
  expect(
    (
      await run({
        events: [
          [10, 0, 2],
          [20, 12, 2],
        ],
      })
    ).statusCode,
  ).toBe(400);
  expect(db.scoutReport.create).not.toHaveBeenCalled();
});
const native = (overrides = {}) =>
  invoke(addScoutReport, { body: { ...body(), ...overrides } });
it("native uploads persist report and feeding quantities atomically and send break warnings", async () => {
  expect(
    (
      await native({
        robotBrokeDescription: "broken",
        accuracy: 3,
        events: [
          [10, 12, 2],
          [20, 13, 2, 8],
        ],
      })
    ).statusCode,
  ).toBe(200);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array));
  expect(db.event.createMany).toHaveBeenCalledWith({
    data: expect.arrayContaining([
      expect.objectContaining({ quantity: 8, points: 0 }),
    ]),
  });
  expect(db.warn).toHaveBeenCalledWith("BREAK", 1, 254, "2026test", "report");
});
it("native uploads reject inconsistent event timelines before creating reports", async () => {
  expect((await native({ events: [[10, 0, 2]] })).statusCode).toBe(400);
  expect(db.scoutReport.create).not.toHaveBeenCalled();
});
it("native uploads import missing event schedules and retry the match", async () => {
  db.teamMatchData.findFirst.mockResolvedValueOnce(null);
  expect((await native()).statusCode).toBe(200);
  expect(db.importMatches).toHaveBeenCalledWith("2026test");
});
it("native uploads return not found when imported schedules omit the match", async () => {
  db.teamMatchData.findFirst.mockResolvedValue(null);
  expect((await native()).statusCode).toBe(404);
});
it("native uploads remain successful if cache invalidation fails after persistence", async () => {
  db.invalidate.mockRejectedValue(new Error("redis"));
  expect((await native()).statusCode).toBe(200);
});
it("native uploads report unexpected transaction failures", async () => {
  db.$transaction.mockRejectedValue(new Error("database"));
  expect((await native()).statusCode).toBe(500);
});
it("native uploads reject malformed event positions before persistence", async () => {
  expect((await native({ events: [[0, 2, 99]] })).statusCode).toBe(400);
  expect(db.$transaction).not.toHaveBeenCalled();
});
it.each(["P2025", "P2002"])(
  "native uploads translate %s transaction errors",
  async (code) => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("synthetic", {
        code,
        clientVersion: "test",
      }),
    );
    expect((await native()).statusCode).toBe(400);
  },
);
it("native uploads validate report fields", async () => {
  expect((await native({ teamNumber: "bad" })).statusCode).toBe(400);
});
it.each([addScoutReport, addScoutReportDashboard])(
  "%s retains unknown feeding quantities as null",
  async (handler) => {
    expect(
      (
        await invoke(handler, {
          body: {
            ...body(),
            accuracy: undefined,
            events: [
              [10, 12, 2],
              [20, 13, 2],
              [30, 7, 6],
            ],
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(db.event.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ action: "STOP_FEEDING", quantity: null }),
      ]),
    });
  },
);
