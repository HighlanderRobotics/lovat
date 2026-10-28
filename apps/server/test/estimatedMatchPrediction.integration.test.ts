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
  expect(own.redAlliance.totalPoints).toBe(30);
  expect(own.redAlliance.teams[0].estimateSamples).toBe(2);
  expect(own.redAlliance.teams[0].archivedSamples).toBe(2);
  const combined = await estimatedMatchPrediction(
    user([1967, 8033]),
    teams,
    db,
  );
  expect(combined.redAlliance.totalPoints).toBe(60);
  expect(combined.redAlliance.teams[0].estimateSamples).toBe(2);
  expect(
    (await estimatedMatchPrediction(user([9999], "EXCLUDE"), teams, db))
      .redAlliance.totalPoints,
  ).toBe(60);
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
it("does not read report scores when a team lacks two usable estimates", async () => {
  await db.estimatedScore.deleteMany({
    where: { matchKey: `${event}_qm2`, teamNumber: teams[0] },
  });
  await expect(
    estimatedMatchPrediction(user([1967, 8033]), teams, db),
  ).rejects.toBe("not enough data");
});
