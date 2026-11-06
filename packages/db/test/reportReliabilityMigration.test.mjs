import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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

test("extends main's reliability enum without recreating reports or losing flags", async () => {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  const schema = `reliability_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(
      'CREATE TABLE "User" ("id" TEXT PRIMARY KEY); CREATE TABLE "ScoutReport" ("uuid" TEXT PRIMARY KEY)',
    );
    const existing = await readFile(
      new URL(
        "../prisma/migrations/20261023000038_add_report_flagging/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(existing);
    await client.query(
      `INSERT INTO "User" VALUES ('voter'); INSERT INTO "ScoutReport" VALUES ('unverified', 'UNVERIFIED'), ('verified', 'VERIFIED'), ('flagged', 'FLAGGED'), ('bad', 'BAD_REPORT'); INSERT INTO "_ReportFlags" VALUES ('flagged', 'voter')`,
    );
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20261106000000_extend_report_reliability/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(migration);
    await client.query(migration);
    const rows = await client.query(
      'SELECT "uuid", "reliability"::text FROM "ScoutReport" ORDER BY "uuid"',
    );
    assert.deepEqual(rows.rows, [
      { uuid: "bad", reliability: "BAD_REPORT" },
      { uuid: "flagged", reliability: "FLAGGED" },
      { uuid: "unverified", reliability: "UNVERIFIED" },
      { uuid: "verified", reliability: "VERIFIED" },
    ]);
    assert.equal(
      (await client.query('SELECT count(*)::int AS count FROM "_ReportFlags"'))
        .rows[0].count,
      1,
    );
    await client.query(
      `INSERT INTO "ScoutReport" VALUES ('system', 'FLAGGED_SYSTEM'), ('user', 'FLAGGED_USER')`,
    );
    assert.equal(
      (await client.query('SELECT count(*)::int AS count FROM "ScoutReport"'))
        .rows[0].count,
      6,
    );
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
