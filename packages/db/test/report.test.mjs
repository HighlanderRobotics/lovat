import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

// This suite writes fixtures. Only run it against the disposable test database.
const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error("Use LOVAT_DB_TEST=1 and a local lovat_test database");
}
const { db } = await import("../dist/index.js");

test("report and event writes commit together, roll back together, and cascade", async () => {
  const fixtureId = randomUUID();
  const teamNumber = -Math.floor(Math.random() * 2_000_000_000) - 1;
  const tournamentKey = `test-${fixtureId}`;
  const matchKey = `test-match-${fixtureId}`;
  const scouterUuid = randomUUID();
  const rolledBackReportUuid = randomUUID();
  const committedReportUuid = randomUUID();
  const reportData = (uuid) => ({
    uuid,
    teamMatchKey: matchKey,
    scouterUuid,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    notes: "Synthetic database fixture",
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
    events: {
      create: [
        { time: 0, action: "START_MATCH", position: "NONE", points: 0 },
        {
          time: 10,
          action: "INTAKE",
          position: "DEPOT",
          points: 0,
          quantity: 2,
        },
      ],
    },
  });

  try {
    await db.team.create({
      data: { number: teamNumber, name: "Report database fixture" },
    });
    await db.registeredTeam.create({
      data: {
        number: teamNumber,
        code: fixtureId,
        email: `${fixtureId}@example.invalid`,
      },
    });
    await db.scouter.create({
      data: { uuid: scouterUuid, sourceTeamNumber: teamNumber },
    });
    await db.tournament.create({
      data: { key: tournamentKey, name: "Report database fixture" },
    });
    await db.teamMatchData.create({
      data: {
        key: matchKey,
        tournamentKey,
        matchNumber: 1,
        teamNumber,
        matchType: "QUALIFICATION",
      },
    });

    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.scoutReport.create({ data: reportData(rolledBackReportUuid) });
        throw new Error("deliberate report rollback");
      }),
      /deliberate report rollback/,
    );
    assert.equal(
      await db.scoutReport.count({ where: { uuid: rolledBackReportUuid } }),
      0,
    );
    assert.equal(
      await db.event.count({
        where: { scoutReportUuid: rolledBackReportUuid },
      }),
      0,
    );

    await db.$transaction(async (tx) => {
      await tx.scoutReport.create({ data: reportData(committedReportUuid) });
    });
    const report = await db.scoutReport.findUniqueOrThrow({
      where: { uuid: committedReportUuid },
      include: { events: true, scouter: true, teamMatchData: true },
    });
    assert.equal(report.scouter.sourceTeamNumber, teamNumber);
    assert.equal(report.teamMatchData.tournamentKey, tournamentKey);
    assert.deepEqual(report.robotRoles, ["SCORING"]);
    assert.equal(report.events.length, 2);
    assert.equal(
      report.events.find((event) => event.action === "INTAKE").quantity,
      2,
    );

    await db.scouter.delete({ where: { uuid: scouterUuid } });
    assert.equal(
      await db.scoutReport.count({ where: { uuid: committedReportUuid } }),
      0,
    );
    assert.equal(
      await db.event.count({ where: { scoutReportUuid: committedReportUuid } }),
      0,
    );
  } finally {
    await db.tournament.deleteMany({ where: { key: tournamentKey } });
    await db.team.deleteMany({ where: { number: teamNumber } });
    await db.$disconnect();
  }
});
