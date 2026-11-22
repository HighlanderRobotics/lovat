import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";

vi.mock("../src/prismaClient.js", () => ({
  default: {
    tournament: { findUnique: vi.fn() },
    match: { findFirst: vi.fn() },
    scoutReport: { findMany: vi.fn() },
  },
}));
vi.mock("../src/lib/strategy/provider.js", async (original) => ({
  ...(await original<typeof import("../src/lib/strategy/provider.js")>()),
  claudeStrategyProvider: { draft: vi.fn() },
}));
const prisma = (await import("../src/prismaClient.js")).default;
const { claudeStrategyProvider, StrategyUnavailableError } =
  await import("../src/lib/strategy/provider.js");
const { getAiStrategyContext, draftAiStrategy } =
  await import("../src/handler/manager/aiStrategy.js");
const params = { tournament: "2026test" };
const match = {
  key: "2026test_qm10",
  competitionLevel: "QUALIFICATION",
  matchNumber: 10,
  setNumber: 1,
  scheduledTime: new Date("2026-03-01T10:00:00Z"),
  teamSlots: [8033, 1, 2, 3, 4, 5].map((teamNumber, i) => ({
    teamNumber,
    alliance: i < 3 ? "RED" : "BLUE",
    station: (i % 3) + 1,
  })),
};
const report = {
  teamMatchKey: "2026test_qm1_0",
  notes: "Can defend",
  robotRoles: ["DEFENSE"],
  driverAbility: 4,
  defenseEffectiveness: 3,
  robotBrokeDescription: null,
  endgameClimb: "NONE",
  autoClimb: "NONE",
  events: [
    { action: "SCORE", points: 3, quantity: 1 },
    { action: "SCORE", points: 6, quantity: 2 },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.tournament.findUnique).mockResolvedValue({
    key: "2026test",
    name: "Test event",
  } as never);
  vi.mocked(prisma.match.findFirst).mockResolvedValue(match as never);
  vi.mocked(prisma.scoutReport.findMany).mockResolvedValue([report] as never);
  vi.mocked(claudeStrategyProvider.draft).mockResolvedValue("Draft strategy");
});
afterEach(() => vi.restoreAllMocks());

it("selects the signed-in team's scheduled match and intersects event/source filters", async () => {
  const response = await invoke(getAiStrategyContext, { params });
  expect(response.statusCode).toBe(200);
  expect(response.headers["Cache-Control"]).toBe("no-store");
  expect(prisma.match.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        tournamentKey: "2026test",
        status: "SCHEDULED",
        teamSlots: { some: { teamNumber: 8033 } },
      },
    }),
  );
  expect(prisma.scoutReport.findMany).toHaveBeenCalledTimes(6);
  expect(prisma.scoutReport.findMany).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      take: 20,
      where: {
        AND: [
          {
            training: false,
            scouter: { sourceTeamNumber: { in: [8033] } },
            teamMatchData: { tournamentKey: undefined },
          },
          { reliability: { in: ["VERIFIED", "UNVERIFIED"] } },
          {
            teamMatchData: {
              tournamentKey: "2026test",
              teamNumber: 8033,
              matchType: { not: "PRACTICE" },
              match: { status: "COMPLETED" },
            },
          },
        ],
      },
    }),
  );
  expect(response.body).toMatchObject({
    teamNumber: 8033,
    reportCount: 6,
    teams: [{ teamNumber: 8033, reportCount: 1 }, {}, {}, {}, {}, {}],
  });
  expect(JSON.stringify(response.body)).not.toContain("Can defend");
  expect(claudeStrategyProvider.draft).not.toHaveBeenCalled();
});

it("sends grounded evidence and the briefing to the provider without personal identifiers", async () => {
  const response = await invoke(draftAiStrategy, {
    params,
    body: { matchKey: match.key, briefing: "Our intake is damaged" },
  });
  expect(response.body).toMatchObject({
    draft: "Draft strategy",
    reportCount: 6,
  });
  const context = vi.mocked(claudeStrategyProvider.draft).mock.calls[0][0];
  expect(context).toMatchObject({
    teamNumber: 8033,
    teamBriefing: "Our intake is damaged",
    teams: [
      {
        reports: [{ actions: { SCORE: { count: 2, points: 9, quantity: 3 } } }],
      },
      {},
      {},
      {},
      {},
      {},
    ],
  });
  expect(JSON.stringify(context)).not.toContain(testUser.email);
});

it("preserves saved tournament exclusions", async () => {
  await invoke(getAiStrategyContext, {
    params,
    user: {
      ...testUser,
      tournamentSourceRule: { mode: "EXCLUDE", items: ["2026test"] },
    },
  });
  const where = vi.mocked(prisma.scoutReport.findMany).mock.calls[0][0]?.where;
  expect(where).toMatchObject({
    AND: [
      { teamMatchData: { tournamentKey: { notIn: ["2026test"] } } },
      {},
      {},
    ],
  });
});

it("rejects stale next matches without calling the model", async () => {
  const response = await invoke(draftAiStrategy, {
    params,
    body: { matchKey: "old" },
  });
  expect(response.statusCode).toBe(409);
  expect(claudeStrategyProvider.draft).not.toHaveBeenCalled();
});
it("rejects caller-supplied teams and oversized briefings", async () => {
  for (const body of [
    { matchKey: match.key, teamNumber: 999 },
    { matchKey: match.key, briefing: "x".repeat(2001) },
  ]) {
    expect((await invoke(draftAiStrategy, { params, body })).statusCode).toBe(
      400,
    );
  }
  expect(prisma.match.findFirst).not.toHaveBeenCalled();
});
it("handles no team, bad event, missing event, missing next match and incomplete assignments", async () => {
  expect(
    (
      await invoke(getAiStrategyContext, {
        params,
        user: { ...testUser, teamNumber: null },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await invoke(getAiStrategyContext, { params: { tournament: "bad" } }))
      .statusCode,
  ).toBe(400);
  vi.mocked(prisma.tournament.findUnique).mockResolvedValueOnce(null);
  expect((await invoke(getAiStrategyContext, { params })).statusCode).toBe(404);
  vi.mocked(prisma.match.findFirst).mockResolvedValueOnce(null);
  expect((await invoke(getAiStrategyContext, { params })).statusCode).toBe(404);
  vi.mocked(prisma.match.findFirst).mockResolvedValueOnce({
    ...match,
    teamSlots: match.teamSlots.slice(1),
  } as never);
  expect((await invoke(getAiStrategyContext, { params })).statusCode).toBe(409);
});
it("refuses a draft with no sourced reports", async () => {
  vi.mocked(prisma.scoutReport.findMany).mockResolvedValue([]);
  expect(
    (await invoke(draftAiStrategy, { params, body: { matchKey: match.key } }))
      .statusCode,
  ).toBe(422);
  expect(claudeStrategyProvider.draft).not.toHaveBeenCalled();
});
it("reports provider unavailability", async () => {
  vi.mocked(claudeStrategyProvider.draft).mockRejectedValue(
    new StrategyUnavailableError("Not configured"),
  );
  expect(
    (await invoke(draftAiStrategy, { params, body: { matchKey: match.key } }))
      .statusCode,
  ).toBe(503);
});

it("previews all six fictional teams without a team membership or private data queries", async () => {
  const { getAiStrategyExample } =
    await import("../src/handler/manager/aiStrategy.js");
  const response = await invoke(getAiStrategyExample, {
    user: { ...testUser, teamNumber: null },
  });
  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({
    isExample: true,
    teamNumber: 8033,
    reportCount: 18,
  });
  const teams = (
    response.body as { teams: { teamNumber: number; alliance: string }[] }
  ).teams;
  expect(
    teams
      .filter((team) => team.alliance === "RED")
      .map((team) => team.teamNumber),
  ).toEqual([8033, 1323, 4414]);
  expect(prisma.scoutReport.findMany).not.toHaveBeenCalled();
  expect(prisma.match.findFirst).not.toHaveBeenCalled();
  expect(claudeStrategyProvider.draft).not.toHaveBeenCalled();
});
it("generates an explicitly labeled example using only the fixed synthetic fixture", async () => {
  const { draftAiStrategyExample } =
    await import("../src/handler/manager/aiStrategy.js");
  const response = await invoke(draftAiStrategyExample, {
    body: { matchKey: "2026norcaldemo_qm4", briefing: "Prioritize feeding" },
    user: { ...testUser, teamNumber: null },
  });
  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({
    isExample: true,
    draft: expect.stringContaining("EXAMPLE ONLY"),
  });
  expect(claudeStrategyProvider.draft).toHaveBeenCalledWith(
    expect.objectContaining({
      isExample: true,
      teamBriefing: "Prioritize feeding",
      teamNumber: 8033,
    }),
  );
  expect(prisma.scoutReport.findMany).not.toHaveBeenCalled();
});
it("rejects arbitrary reports or match identities in example mode", async () => {
  const { draftAiStrategyExample } =
    await import("../src/handler/manager/aiStrategy.js");
  for (const body of [
    { matchKey: "other" },
    { matchKey: "2026norcaldemo_qm4", reports: [] },
  ]) {
    expect((await invoke(draftAiStrategyExample, { body })).statusCode).toBe(
      400,
    );
  }
  expect(claudeStrategyProvider.draft).not.toHaveBeenCalled();
});

it("provides bounded local evidence with the same report filters and without a model request", async () => {
  const response = await invoke(getAiStrategyContext, {
    params,
    query: { local: "true" },
  });
  const prompt = (response.body as { localPrompt: string }).localPrompt;
  expect(prompt.length).toBeLessThan(10000);
  expect(JSON.parse(prompt)).toMatchObject({
    teamNumber: 8033,
    teams: [
      { team: 8033, observations: [{ note: "Can defend" }] },
      {},
      {},
      {},
      {},
      {},
    ],
  });
  expect(prisma.scoutReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          expect.objectContaining({
            training: false,
            scouter: { sourceTeamNumber: { in: [8033] } },
          }),
        ]),
      },
    }),
  );
  expect(claudeStrategyProvider.draft).not.toHaveBeenCalled();
});
it("provides labeled local example evidence without database reads", async () => {
  const { getAiStrategyExample } =
    await import("../src/handler/manager/aiStrategy.js");
  const response = await invoke(getAiStrategyExample, {
    query: { local: "true" },
    user: { ...testUser, teamNumber: null },
  });
  const prompt = (response.body as { localPrompt: string }).localPrompt;
  expect(prompt.length).toBeLessThan(10000);
  expect(JSON.parse(prompt)).toMatchObject({
    isExample: true,
    teamNumber: 8033,
  });
  expect(prisma.scoutReport.findMany).not.toHaveBeenCalled();
  expect(claudeStrategyProvider.draft).not.toHaveBeenCalled();
});
