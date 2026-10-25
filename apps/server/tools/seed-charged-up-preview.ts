import { db } from "@lovat/db";
import { chargedUpFixture } from "../test/fixtures/chargedUpTraining.js";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error("Use the disposable local lovat_test database.");
}
try {
  await db.team.upsert({
    where: { number: 8033 },
    create: { number: 8033, name: "Synthetic preview team" },
    update: {},
  });
  await db.registeredTeam.upsert({
    where: { number: 8033 },
    create: {
      number: 8033,
      code: "training-local",
      email: "preview@example.invalid",
    },
    update: {},
  });
  await db.tournament.upsert({
    where: { key: "2023synthetic" },
    create: { key: "2023synthetic", name: "Synthetic UI preview" },
    update: {},
  });
  await db.match.upsert({
    where: { key: "2023synthetic_qm1" },
    create: {
      key: "2023synthetic_qm1",
      tournamentKey: "2023synthetic",
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 1,
    },
    update: {},
  });
  await db.teamMatchData.upsert({
    where: { key: "2023synthetic_qm1_8033" },
    create: {
      key: "2023synthetic_qm1_8033",
      matchKey: "2023synthetic_qm1",
      tournamentKey: "2023synthetic",
      matchType: "QUALIFICATION",
      matchNumber: 1,
      teamNumber: 8033,
      alliance: "RED",
    },
    update: {},
  });
  await db.trainingVideo.upsert({
    where: { uuid: "33000000-0000-4000-8000-000000000001" },
    create: {
      uuid: "33000000-0000-4000-8000-000000000001",
      matchKey: "2023synthetic_qm1",
      // Deliberately invalid clip: UI preview only, never publish as a real exercise.
      videoLink: "https://www.youtube.com/watch?v=synthetic01",
      durationSeconds: 150,
      chargedUpAnswerKey: chargedUpFixture(),
    },
    update: {},
  });
  console.log(
    "Synthetic Charged Up UI preview seeded in local lovat_test only.",
  );
} finally {
  await db.$disconnect();
}
