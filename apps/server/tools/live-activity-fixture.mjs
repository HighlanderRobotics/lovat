import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// This fixture may only touch the dedicated local QA database, never a hosted
// database or an existing developer database.
const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55439");
assert.equal(url.pathname, "/live_activity_qa");
const fixture = JSON.parse(
  await readFile(process.env.LIVE_ACTIVITY_FIXTURE, "utf8"),
);
const { db } = await import("@lovat/db");
const tournamentKey = fixture.tournamentKey;
const command = process.argv[2];
const specs = [
  ["q27", "QUALIFICATION", 27, "QUALIFICATION", 27, 8433],
  ["q28", "QUALIFICATION", 28, "QUALIFICATION", 28, 8433],
  ["q29", "QUALIFICATION", 29, "QUALIFICATION", 29, 8033],
  ["p1", "ELIMINATION", 1, "SEMIFINAL", 1, 8433],
  ["f1", "ELIMINATION", 2, "FINAL", 1, 8033],
];

try {
  if (command === "seed") {
    for (const number of new Set([
      fixture.teamNumber,
      8433,
      8033,
      254,
      1640,
      1323,
      5410,
      5026,
      841,
    ])) {
      await db.team.upsert({
        where: { number },
        create: { number, name: `QA team ${number}` },
        update: {},
      });
    }
    await db.registeredTeam.upsert({
      where: { number: fixture.teamNumber },
      create: {
        number: fixture.teamNumber,
        code: fixture.teamCode,
        email: "live-activity-qa@example.invalid",
      },
      update: { code: fixture.teamCode },
    });
    await db.scouter.upsert({
      where: { uuid: fixture.scouterUuid },
      create: {
        uuid: fixture.scouterUuid,
        name: "Live Activity QA scout",
        sourceTeamNumber: fixture.teamNumber,
      },
      update: {},
    });
    const today = new Date(new Date().toISOString().slice(0, 10));
    await db.tournament.upsert({
      where: { key: tournamentKey },
      create: {
        key: tournamentKey,
        name: "Live Activity QA — synthetic matches",
        startDate: today,
        endDate: today,
      },
      update: { startDate: today, endDate: today },
    });
    for (const [index, spec] of specs.entries()) {
      const [
        suffix,
        matchType,
        legacyNumber,
        competitionLevel,
        matchNumber,
        teamNumber,
      ] = spec;
      const key = `${tournamentKey}_qa_${suffix}`;
      const data = {
        tournamentKey,
        competitionLevel,
        setNumber: 1,
        matchNumber,
        displayOrder: index,
        status: "SCHEDULED",
        scheduledTime: new Date(Date.now() + (index - 1) * 180_000),
      };
      await db.match.upsert({
        where: { key },
        create: { key, ...data },
        update: data,
      });
      for (const [position, participant] of [
        teamNumber,
        1640,
        1323,
        5410,
        5026,
        841,
      ].entries()) {
        const slot = {
          tournamentKey,
          matchType,
          matchNumber: legacyNumber,
          teamNumber: participant,
          matchKey: key,
          alliance: position < 3 ? "RED" : "BLUE",
          station: (position % 3) + 1,
        };
        await db.teamMatchData.upsert({
          where: { key: `${key}_${position}` },
          create: { key: `${key}_${position}`, ...slot },
          update: slot,
        });
      }
      for (const color of ["RED", "BLUE"]) {
        await db.matchAlliance.upsert({
          where: { matchKey_color: { matchKey: key, color } },
          create: { matchKey: key, color },
          update: {},
        });
      }
    }
    await db.scouterScheduleShift.upsert({
      where: { uuid: "d92adc22-b4d6-4c29-aefb-29716c132d59" },
      create: {
        uuid: "d92adc22-b4d6-4c29-aefb-29716c132d59",
        sourceTeamNumber: fixture.teamNumber,
        tournamentKey,
        startMatchOrdinalNumber: 28,
        endMatchOrdinalNumber: 31,
        team1: { connect: { uuid: fixture.scouterUuid } },
      },
      update: {},
    });
    console.log("Seeded isolated QA matches: Q27 → Q28 → Q29 → P1 → F1");
  } else if (command === "advance" || command === "cancel") {
    const next = await db.match.findFirst({
      where: {
        tournamentKey,
        key: { contains: "_qa_" },
        status: { notIn: ["COMPLETED", "CANCELED"] },
      },
      orderBy: { displayOrder: "asc" },
    });
    assert(next, "No pending QA matches remain; use seed to reset");
    await db.match.update({
      where: { key: next.key },
      data: { status: command === "cancel" ? "CANCELED" : "COMPLETED" },
    });
    console.log(
      `QA match ${next.key.split("_qa_")[1]} ${command === "cancel" ? "canceled" : "completed"}`,
    );
  } else if (command === "reassign") {
    const next = await db.teamMatchData.findFirst({
      where: { tournamentKey, match: { status: "SCHEDULED" }, matchNumber: 28 },
    });
    assert(next, "Q28 must be pending to test reassignment");
    await db.teamMatchData.update({
      where: { key: next.key },
      data: { teamNumber: 254 },
    });
    console.log("Reassigned Q28 to scout team 254");
  } else {
    throw new Error("Use seed, advance, cancel, or reassign");
  }
} finally {
  await db.$disconnect();
}
