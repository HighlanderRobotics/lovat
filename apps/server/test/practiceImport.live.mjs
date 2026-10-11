import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Never run this write check against the application's normal database.
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
if (!process.env.NEXUS_API_KEY?.trim()) {
  throw new Error("Set NEXUS_API_KEY to run the live Nexus import check");
}

const eventKey = process.env.LOVAT_TEST_EVENT_KEY?.trim() || "2026cael";
const { fetchPracticeMatches } =
  await import("../dist/src/lib/fetchPracticeMatches.js");
const matches = await fetchPracticeMatches(eventKey);
assert.ok(matches.length > 0, "Choose a Nexus event with a practice schedule");

const { default: prisma } = await import("../dist/src/prismaClient.js");
const { addPracticeMatches } =
  await import("../dist/src/handler/manager/addPracticeMatches.js");
const fixtureName = `LVT-285 live test ${randomUUID()}`;
let created = false;

try {
  const existing = await prisma.tournament.findUnique({
    where: { key: eventKey },
  });
  assert.equal(
    existing,
    null,
    "This event already exists in lovat_test; leave it untouched",
  );
  await prisma.tournament.create({
    data: { key: eventKey, name: fixtureName },
  });
  created = true;

  await addPracticeMatches(eventKey);
  const rows = await prisma.teamMatchData.findMany({
    where: { tournamentKey: eventKey },
    orderBy: { key: "asc" },
  });
  const expectedKeys = [
    ...new Set(
      matches.flatMap((match) =>
        match.teamNumbers.map(
          (team) => `${eventKey}_pm${match.matchNumber}_${team}`,
        ),
      ),
    ),
  ].sort();
  assert.deepEqual(rows.map((row) => row.key).sort(), expectedKeys);
  for (const row of rows) {
    assert.equal(row.matchType, "PRACTICE");
    assert.equal(row.practiceScheduled, true);
  }

  await addPracticeMatches(eventKey);
  const repeated = await prisma.teamMatchData.findMany({
    where: { tournamentKey: eventKey },
    orderBy: { key: "asc" },
  });
  assert.deepEqual(
    repeated,
    rows,
    "Reimport must not add duplicate rows or change identities",
  );
  console.log(
    `PASS: ${matches.length} practice matches saved as ${rows.length} team rows.`,
  );
  console.log("PASS: importing the schedule again created no duplicates.");
} finally {
  try {
    if (created) {
      // Delete only the event created by this run; its match rows cascade away.
      const removed = await prisma.tournament.deleteMany({
        where: { key: eventKey, name: fixtureName },
      });
      assert.equal(
        removed.count,
        1,
        "Could not remove this run's test fixture",
      );
      console.log("Temporary test records removed.");
    }
  } finally {
    await prisma.$disconnect();
  }
}
