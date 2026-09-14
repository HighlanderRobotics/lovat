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
const names = [
  "20250209194343_test",
  "20260117_align_current_schema",
  "20260913000000_reconcile_current_schema",
];
const sql = await Promise.all(
  names.map((name) =>
    readFile(
      new URL(`../prisma/migrations_backup/${name}/migration.sql`, import.meta.url),
      "utf8",
    ),
  ),
);

async function withLegacyDatabase(run) {
  const admin = new pg.Client({ connectionString: url.href });
  const name = `lovat_migration_${randomUUID().replaceAll("-", "")}`;
  let client,
    created = false;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const target = new URL(url);
    target.pathname = `/${name}`;
    client = new pg.Client({ connectionString: target.href });
    await client.connect();
    await client.query(sql[0]);
    await client.query(sql[1]);
    await client.query(`
      INSERT INTO "Team" (number, name) VALUES (8033, 'Fixture');
      INSERT INTO "RegisteredTeam" (number, code, email) VALUES (8033, 'fixture', 'fixture@example.invalid');
      INSERT INTO "Tournament" (key, name) VALUES ('fixture', 'Fixture');
      INSERT INTO "User" (id, email, "teamNumber", "teamSource", "tournamentSource")
        VALUES ('fixture', 'fixture@example.invalid', 8033, ARRAY[8033, 254], ARRAY['fixture']),
        ('empty', 'empty@example.invalid', 8033, ARRAY[]::integer[], ARRAY[]::text[]),
        ('null', 'null@example.invalid', 8033, NULL, NULL);
    `);
    await run(client);
  } finally {
    await client?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}

test("forward migration preserves accounts and source allowlists", async () => {
  await withLegacyDatabase(async (client) => {
    await client.query(sql[2]);
    const { rows } = await client.query(
      'SELECT id, "teamSourceRule", "tournamentSourceRule" FROM "User"',
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.find((r) => r.id === "fixture"),
      {
        id: "fixture",
        teamSourceRule: { mode: "INCLUDE", items: [8033, 254] },
        tournamentSourceRule: { mode: "INCLUDE", items: ["fixture"] },
      },
    );
    for (const id of ["empty", "null"]) {
      const row = rows.find((r) => r.id === id);
      assert.deepEqual(row.teamSourceRule, { mode: "INCLUDE", items: [] });
      assert.deepEqual(row.tournamentSourceRule, {
        mode: "INCLUDE",
        items: [],
      });
    }
    for (const table of ["Team", "RegisteredTeam", "Tournament"])
      assert.equal(
        (await client.query(`SELECT * FROM "${table}"`)).rowCount,
        1,
      );
    await client.query(
      'SELECT * FROM "ApiKey", "SlackWorkspace", "EmailVerificationRequest", "CachedAnalysis"',
    );
  });
});

for (const fixture of ["report", "picklist"]) {
  test(`legacy ${fixture} aborts atomically without losing data`, async () => {
    await withLegacyDatabase(async (client) => {
      if (fixture === "report") {
        await client.query(`
          INSERT INTO "Scouter" (uuid, "sourceTeamNumber") VALUES ('fixture', 8033);
          INSERT INTO "TeamMatchData" (key, "tournamentKey", "matchNumber", "teamNumber", "matchType") VALUES ('fixture', 'fixture', 1, 8033, 'QUALIFICATION');
          INSERT INTO "ScoutReport" (uuid, "teamMatchKey", "startTime", notes, "algaePickup", "coralPickup", "climbResult", "knocksAlgae", "underShallowCage", "driverAbility", "scouterUuid")
            VALUES ('fixture', 'fixture', CURRENT_TIMESTAMP, 'retain this note', 'NONE', 'NONE', 'NOT_ATTEMPTED', 'NO', 'NO', 0, 'fixture');
        `);
      } else {
        await client.query(
          `INSERT INTO "SharedPicklist" (uuid, name, "totalPoints", defense, "driverAbility", "autoPoints", "algaePickups", "coralPickups", climb, "coralLevel1Scores", "coralLevel2Scores", "coralLevel3Scores", "coralLevel4Scores", "algaeProcessor", "algaeNet", "teleopPoints", feeds, "authorId") VALUES ('fixture', 'retain this picklist', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'fixture')`,
        );
      }
      await assert.rejects(client.query(sql[2]), /Legacy season data exists/);
      await client.query("ROLLBACK");
      const table = fixture === "report" ? "ScoutReport" : "SharedPicklist";
      assert.equal(
        (await client.query(`SELECT * FROM "${table}"`)).rowCount,
        1,
      );
      assert.deepEqual(
        (
          await client.query(
            `SELECT "teamSource" FROM "User" WHERE id = 'fixture'`,
          )
        ).rows[0].teamSource,
        [8033, 254],
      );
      assert.equal(
        (await client.query(`SELECT to_regclass('public."ApiKey"') AS name`))
          .rows[0].name,
        null,
      );
    });
  });
}
