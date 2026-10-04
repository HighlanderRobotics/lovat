import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";

vi.mock("../src/prismaClient.js", () => ({
  default: {
    scouter: { findFirst: vi.fn() },
    teamMatchData: { findFirst: vi.fn(), upsert: vi.fn() },
    scoutReport: { create: vi.fn() },
    event: { createMany: vi.fn() },
  },
}));
vi.mock("../src/handler/manager/addTournamentMatches.js", () => ({
  addTournamentMatches: vi.fn(),
}));
vi.mock("../src/lib/clearCache.js", () => ({ invalidateCache: vi.fn() }));
vi.mock("../src/handler/slack/sendWarningNotification.js", () => ({
  sendWarningToSlack: vi.fn(),
}));
vi.mock(
  "../src/handler/analysis/scoutingLead/totalPointsScoutingLead.js",
  () => ({
    totalPointsScoutingLead: vi.fn(),
  }),
);

import prismaClient from "../src/prismaClient.js";
import { addTournamentMatches } from "../src/handler/manager/addTournamentMatches.js";
import { addScoutReportDashboard } from "../src/handler/manager/scoutreports/addScoutReportDashboard.js";

function requestFor(matchType = "PRACTICE"): AuthenticatedRequest {
  return {
    tokenType: "bearer",
    user: { id: "test-user", teamNumber: 8033 },
    body: {
      uuid: "test-report",
      tournamentKey: "2026test",
      matchType,
      matchNumber: 1,
      startTime: 0,
      notes: "",
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
      scouterUuid: "test-scouter",
      teamNumber: 9999,
      events: [],
    },
  } as unknown as AuthenticatedRequest;
}

function responseFor() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn() };
}

describe("Dashboard practice report uploads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prismaClient.scouter.findFirst).mockResolvedValue({
      uuid: "test-scouter",
      sourceTeamNumber: 8033,
    } as Awaited<ReturnType<typeof prismaClient.scouter.findFirst>>);
  });

  it("creates a missing practice match and attaches the report without importing official matches", async () => {
    const match = { key: "2026test_pm1_9999" } as NonNullable<
      Awaited<ReturnType<typeof prismaClient.teamMatchData.findFirst>>
    >;
    vi.mocked(prismaClient.teamMatchData.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(match);
    vi.mocked(prismaClient.teamMatchData.upsert).mockResolvedValue(match);
    const res = responseFor();

    await addScoutReportDashboard(requestFor(), res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(addTournamentMatches).not.toHaveBeenCalled();
    expect(prismaClient.teamMatchData.upsert).toHaveBeenCalledWith({
      where: { key: match.key },
      update: {},
      create: {
        key: match.key,
        tournamentKey: "2026test",
        matchNumber: 1,
        teamNumber: 9999,
        matchType: "PRACTICE",
      },
    });
    expect(prismaClient.scoutReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamMatchData: { connect: { key: match.key } },
      }),
    });
  });

  it("keeps importing missing official matches", async () => {
    vi.mocked(prismaClient.teamMatchData.findFirst).mockResolvedValue(null);
    const res = responseFor();

    await addScoutReportDashboard(
      requestFor("QUALIFICATION"),
      res as unknown as Response,
    );

    expect(addTournamentMatches).toHaveBeenCalledWith("2026test");
    expect(prismaClient.teamMatchData.upsert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("rejects uploads from another source team before creating a practice match", async () => {
    const req = requestFor();
    req.user.teamNumber = 1111;
    const res = responseFor();

    await addScoutReportDashboard(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prismaClient.teamMatchData.upsert).not.toHaveBeenCalled();
    expect(prismaClient.scoutReport.create).not.toHaveBeenCalled();
  });
});
