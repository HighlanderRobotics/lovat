import { readFile } from "node:fs/promises";
import { db } from "@lovat/db";
import {
  EventActionMap,
  PositionMap,
} from "../src/handler/manager/managerConstants.js";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error(
    "This fixture seed only runs against the disposable local lovat_test database.",
  );
}
try {
  const report = JSON.parse(
    await readFile(
      new URL(
        "../test/fixtures/training/118-johnson-qual-19.report.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.team.upsert({
    where: { number: 8033 },
    create: { number: 8033, name: "Local training team" },
    update: {},
  });
  await db.team.upsert({
    where: { number: 118 },
    create: { number: 118, name: "Robonauts" },
    update: {},
  });
  await db.registeredTeam.upsert({
    where: { number: 8033 },
    create: {
      number: 8033,
      code: "training-local",
      email: "training@example.invalid",
    },
    update: {},
  });
  await db.scouter.upsert({
    where: { uuid: report.scouterUuid },
    create: {
      uuid: report.scouterUuid,
      name: "Training scout",
      sourceTeamNumber: 8033,
    },
    update: {},
  });
  await db.tournament.upsert({
    where: { key: "2026joh" },
    create: { key: "2026joh", name: "Johnson Division 2026" },
    update: {},
  });
  await db.match.upsert({
    where: { key: "2026joh_qm19" },
    create: {
      key: "2026joh_qm19",
      tournamentKey: "2026joh",
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 19,
    },
    update: {},
  });
  const slot = await db.teamMatchData.upsert({
    where: { key: "2026joh_qm19_118" },
    create: {
      key: "2026joh_qm19_118",
      matchKey: "2026joh_qm19",
      tournamentKey: "2026joh",
      matchNumber: 19,
      matchType: "QUALIFICATION",
      teamNumber: 118,
      alliance: "RED",
      station: 1,
    },
    update: {},
  });
  const {
    events,
    mobility,
    tournamentKey: _tournament,
    matchType: _type,
    matchNumber: _number,
    teamNumber: _team,
    startTime,
    ...fields
  } = report;
  void _tournament;
  void _type;
  void _number;
  void _team;
  await db.scoutReport.upsert({
    where: { uuid: report.uuid },
    update: {},
    create: {
      ...fields,
      fieldTraversal: mobility,
      startTime: new Date(startTime),
      teamMatchKey: slot.key,
      training: true,
      events: {
        create: events.map(([time, action, position, quantity]: number[]) => ({
          time,
          action: EventActionMap[action],
          position: PositionMap[position],
          quantity: quantity ?? 0,
          points: action === 1 ? quantity : 0,
        })),
      },
    },
  });
  await db.trainingVideo.upsert({
    where: { uuid: "6580274b-cfe1-4c10-a043-e80a2ddf9162" },
    update: {},
    create: {
      uuid: "6580274b-cfe1-4c10-a043-e80a2ddf9162",
      matchKey: "2026joh_qm19",
      videoLink: "https://www.youtube.com/watch?v=gmdPS6_RVJw",
      startOffsetSeconds: 7,
      durationSeconds: 163,
      alliance: "RED",
      excludedFields: ["feederTypes", "disrupts", "defenseEffectiveness"],
      answerKeyReports: { connect: { uuid: report.uuid } },
    },
  });
  console.log(
    "Local training exercise ready: 2026joh_qm19, robot 118; local team 8033, scout Training scout.",
  );
} finally {
  await db.$disconnect();
}
