import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

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

const migration = await readFile(
  new URL(
    "../prisma/migrations/20261011000000_mark_scheduled_practice_matches/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

test("practice schedule migration preserves reports and defaults old rows to private", async () => {
  const client = new pg.Client({ connectionString: url.href });
  const schema = `practice_migration_${randomUUID().replaceAll("-", "")}`;
  let transactionStarted = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);

    // A minimal pre-migration fixture for the affected table and report relation.
    await client.query(`
      CREATE TABLE "TeamMatchData" (key TEXT PRIMARY KEY);
      CREATE TABLE "ScoutReport" (
        uuid TEXT PRIMARY KEY,
        "teamMatchKey" TEXT REFERENCES "TeamMatchData"(key),
        notes TEXT NOT NULL
      );
      INSERT INTO "TeamMatchData" (key) VALUES ('2026fixture_pm1_8033');
      INSERT INTO "ScoutReport" (uuid, "teamMatchKey", notes)
        VALUES ('fixture', '2026fixture_pm1_8033', 'Synthetic test note');
    `);

    await client.query(migration);

    const existing = await client.query(
      'SELECT "practiceScheduled" FROM "TeamMatchData" WHERE key = $1',
      ["2026fixture_pm1_8033"],
    );
    assert.equal(existing.rows[0].practiceScheduled, false);

    await client.query(
      'UPDATE "TeamMatchData" SET "practiceScheduled" = true WHERE key = $1',
      ["2026fixture_pm1_8033"],
    );
    const report = await client.query(`
      SELECT r.notes, m."practiceScheduled"
      FROM "ScoutReport" r
      JOIN "TeamMatchData" m ON m.key = r."teamMatchKey"
    `);
    assert.deepEqual(report.rows, [
      {
        notes: "Synthetic test note",
        practiceScheduled: true,
      },
    ]);

    await client.query('INSERT INTO "TeamMatchData" (key) VALUES ($1)', [
      "2026fixture_pm2_254",
    ]);
    const newRow = await client.query(
      'SELECT "practiceScheduled" FROM "TeamMatchData" WHERE key = $1',
      ["2026fixture_pm2_254"],
    );
    assert.equal(newRow.rows[0].practiceScheduled, false);
  } finally {
    // Rolling back removes this test's schema and all its fixtures.
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }
});
