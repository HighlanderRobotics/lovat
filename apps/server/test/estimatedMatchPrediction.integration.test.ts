import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import type { User } from "@lovat/db";
const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
)
  throw new Error("Use disposable local lovat_test only");
const { createDb } = await import("@lovat/db");
const { estimatedMatchPrediction } =
  await import("../src/handler/analysis/predictions/estimatedMatchPrediction.js");
const { matchAnalysisStatus } =
  await import("../src/handler/manager/matchAnalysisStatus.js");
const { teamEstimateSummary } =
  await import("../src/handler/analysis/teamLookUp/teamEstimates.js");
const db = createDb(url.href),
  event = `estimate-${randomUUID()}`;
const teams = [910001, 910002, 910003, 910004, 910005, 910006];
const user = (sources: number[], mode: "INCLUDE" | "EXCLUDE" = "INCLUDE") =>
  ({
    id: "estimate-user",
    role: "ANALYST",
    username: "Synthetic",
    email: "estimate@example.invalid",
    emailVerified: true,
    teamNumber: 1967,
    teamSourceRule: { mode, items: sources },
    tournamentSourceRule: { mode: "INCLUDE", items: [event] },
  }) as User;
beforeAll(async () => {
  await db.tournament.create({
    data: { key: event, name: "Synthetic estimate source test" },
  });
  for (const n of [1, 2]) {
    const matchKey = `${event}_qm${n}`;
    await db.match.create({
      data: {
        key: matchKey,
        tournamentKey: event,
        competitionLevel: "QUALIFICATION",
        setNumber: 1,
        matchNumber: n,
      },
    });
    for (const [index, teamNumber] of teams.entries()) {
      await db.team.upsert({
        where: { number: teamNumber },
        create: { number: teamNumber, name: "Synthetic" },
        update: {},
      });
      await db.teamMatchData.create({
        data: {
          key: `${matchKey}_${index}`,
          matchKey,
          tournamentKey: event,
          matchNumber: n,
          matchType: "QUALIFICATION",
          teamNumber,
          alliance: index < 3 ? "RED" : "BLUE",
          station: (index % 3) + 1,
        },
      });
    }
    for (const color of ["RED", "BLUE"] as const)
      await db.matchAlliance.create({
        data: {
          matchKey,
          color,
          score: 10,
          scoreBreakdown: { foulPoints: color === "RED" ? 5 : 2 },
        },
      });
    await db.estimatedScore.createMany({
      data: teams.flatMap((teamNumber) =>
        [
          {
            scopeKey: "one",
            sourceTeams: [1967],
            totalPoints: 10,
            inputOrigin: "ARCHIVE",
          },
          { scopeKey: "both", sourceTeams: [1967, 8033], totalPoints: 20 },
          {
            scopeKey: "private",
            sourceTeams: [1967, 8033, 9999],
            totalPoints: 900,
          },
        ].map((v) => ({
          ...v,
          matchKey,
          teamNumber,
          algorithm: "scoreboard-constrained-fusion-v5-tba-consensus",
          inputSha256: "synthetic",
          attributionStatus: "REPORT_BACKED_ESTIMATE",
          reportCount: 1,
          autoFuel: 0,
          teleopFuel: 0,
          totalFuel: 0,
          autoPoints: 0,
          teleopPoints: v.totalPoints,
          scoutPoints: v.totalPoints + 5,
        })),
      ),
    });
  }
});
afterAll(async () => {
  await db.tournament.delete({ where: { key: event } });
  await db.$disconnect();
});
it("uses only fully permitted source scopes and counts each match once", async () => {
  const own = await estimatedMatchPrediction(user([1967]), teams, db);
  expect(own.redAlliance.robotPoints).toBe(30);
  expect(own.redAlliance.totalPoints).toBe(35);
  expect(own.redAlliance.foulPoints).toBe(5);
  expect(own.redAlliance.teams[0].scoutAverage).toBe(15);
  expect(own.redAlliance.teams[0].ocrAdjustment).toBe(-5);
  expect(own.redAlliance.teams[0].estimateSamples).toBe(2);
  expect(own.redAlliance.teams[0].archivedSamples).toBe(2);
  const combined = await estimatedMatchPrediction(
    user([1967, 8033]),
    teams,
    db,
  );
  expect(combined.redAlliance.totalPoints).toBe(65);
  expect(combined.redAlliance.teams[0].estimateSamples).toBe(2);
  expect(
    (await estimatedMatchPrediction(user([9999], "EXCLUDE"), teams, db))
      .redAlliance.totalPoints,
  ).toBe(65);
});
it("fails closed for empty allowed sources and excluded tournaments", async () => {
  await expect(estimatedMatchPrediction(user([]), teams, db)).rejects.toBe(
    "not enough data",
  );
  const noEvent = {
    ...user([1967]),
    tournamentSourceRule: { mode: "EXCLUDE", items: [event] },
  } as User;
  await expect(estimatedMatchPrediction(noEvent, teams, db)).rejects.toBe(
    "not enough data",
  );
});
it("scopes team lookup estimates to the allowed report owners and tournaments", async () => {
  const own = await teamEstimateSummary(user([1967]), teams[0], db);
  expect(own).toMatchObject({
    sampleCount: 2,
    averagePoints: 10,
    scoutAverage: 15,
    ocrAdjustment: -5,
  });
  const combined = await teamEstimateSummary(user([1967, 8033]), teams[0], db);
  expect(combined.averagePoints).toBe(20);
  expect(combined.matches).toHaveLength(2);
  expect((await teamEstimateSummary(user([]), teams[0], db)).sampleCount).toBe(
    0,
  );
  expect(
    (
      await teamEstimateSummary(
        {
          ...user([1967]),
          tournamentSourceRule: { mode: "EXCLUDE", items: [event] },
        } as User,
        teams[0],
        db,
      )
    ).sampleCount,
  ).toBe(0);
});
it("does not read report scores when a team lacks two usable estimates", async () => {
  await db.estimatedScore.deleteMany({
    where: { matchKey: `${event}_qm2`, teamNumber: teams[0] },
  });
  await expect(
    estimatedMatchPrediction(user([1967, 8033]), teams, db),
  ).rejects.toBe("not enough data");
});

it("requires valid reports for all six teams within the selected scope for a full-scout marker", async () => {
  const number = 910099;
  await db.team.upsert({
    where: { number },
    create: { number, name: "Synthetic source" },
    update: {},
  });
  await db.registeredTeam.create({
    data: { number, code: event, email: `${event}@example.invalid` },
  });
  const scouter = await db.scouter.create({
    data: { sourceTeamNumber: number },
  });
  const input = { mode: "INCLUDE" as const, items: [1967] };
  const before = await matchAnalysisStatus(event, input, db);
  expect(before.find((m) => m.key === `${event}_qm1`)).toMatchObject({
    ocrAnalyzed: true,
    fullyScouted: false,
  });
  const reports = [];
  for (let i = 0; i < 6; i++)
    reports.push(
      await db.scoutReport.create({
        data: {
          teamMatchKey: `${event}_qm1_${i}`,
          scouterUuid: scouter.uuid,
          startTime: new Date(),
          notes: "",
          robotRoles: ["SCORING"],
          driverAbility: 3,
          autoClimb: "NOT_ATTEMPTED",
          beached: "NEITHER",
          defenseEffectiveness: 0,
          feederTypes: [],
          intakeType: "NEITHER",
          fieldTraversal: "NONE",
          scoresWhileMoving: false,
          disrupts: false,
          endgameClimb: "NOT_ATTEMPTED",
        },
      }),
    );
  expect(
    (await matchAnalysisStatus(event, input, db)).find(
      (m) => m.key === `${event}_qm1`,
    )?.fullyScouted,
  ).toBe(false);
  const source = { mode: "INCLUDE" as const, items: [number] };
  expect(
    (await matchAnalysisStatus(event, source, db)).find(
      (m) => m.key === `${event}_qm1`,
    )?.fullyScouted,
  ).toBe(true);
  await db.scoutReport.update({
    where: { uuid: reports[0].uuid },
    data: { analysisExcluded: true },
  });
  expect(
    (await matchAnalysisStatus(event, source, db)).find(
      (m) => m.key === `${event}_qm1`,
    )?.fullyScouted,
  ).toBe(false);
  await db.registeredTeam.delete({ where: { number } });
});
