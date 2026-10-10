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
      new URL(
        `../prisma/migrations_backup/${name}/migration.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);

const baselineSql = await readFile(
  new URL("../prisma/migrations/0_baseline/migration.sql", import.meta.url),
  "utf8",
);
const competitionSql = await readFile(
  new URL(
    "../prisma/migrations/20261010180215_add_season_match_and_more/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const importSql = await readFile(
  new URL(
    "../prisma/migrations/20261010193000_add_import_fetch_state_and_jobs/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

async function withBaselineDatabase(run) {
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
    await client.query(baselineSql);
    await client.query(`
      INSERT INTO "Team" (number, name) VALUES (8033, 'Existing team');
      INSERT INTO "RegisteredTeam" (number, code, email)
        VALUES (8033, 'fixture', 'fixture@example.invalid');
      INSERT INTO "Scouter" (uuid, "sourceTeamNumber") VALUES ('scouter', 8033);
      INSERT INTO "Tournament" (key, name) VALUES ('2026fixture', 'Fixture');
      INSERT INTO "TeamMatchData" (key, "tournamentKey", "matchNumber", "teamNumber", "matchType")
        VALUES ('missing-team', '2026fixture', 1, 254, 'QUALIFICATION'),
               ('known-team', '2026fixture', 1, 8033, 'QUALIFICATION');
      INSERT INTO "ScoutReport" (uuid, "teamMatchKey", "startTime", notes,
        "driverAbility", "scouterUuid", beached, "defenseEffectiveness",
        "intakeType", "fieldTraversal", "scoresWhileMoving", disrupts,
        "endgameClimb", "autoClimb")
        VALUES ('report', 'missing-team', CURRENT_TIMESTAMP, 'Preserve this note',
          3, 'scouter', 'NEITHER', 0, 'NEITHER', 'NONE', false, false,
          'NOT_ATTEMPTED', 'NOT_ATTEMPTED');
      INSERT INTO "Event" ("eventUuid", time, action, position, points, quantity, "scoutReportUuid")
        VALUES ('action', 10, 'INTAKE', 'DEPOT', 0, 2, 'report');
    `);
    await run(client);
  } finally {
    await client?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}

test("competition migration backfills missing teams and preserves reports and actions", async () => {
  await withBaselineDatabase(async (client) => {
    const reportsBefore = (await client.query('SELECT * FROM "ScoutReport"'))
      .rows;
    const actionsBefore = (await client.query('SELECT * FROM "Event"')).rows;
    await client.query(competitionSql);
    assert.deepEqual(
      (await client.query('SELECT * FROM "ScoutReport"')).rows,
      reportsBefore,
    );
    assert.deepEqual(
      (await client.query('SELECT * FROM "Event"')).rows,
      actionsBefore,
    );
    assert.deepEqual(
      (await client.query('SELECT * FROM "Team" ORDER BY number')).rows,
      [
        { number: 254, name: "Team 254" },
        { number: 8033, name: "Existing team" },
      ],
    );
    const slots = (await client.query('SELECT * FROM "TeamMatchData"')).rows;
    assert.equal(slots.length, 2);
    assert.ok(
      slots.every((slot) => slot.matchKey === null && slot.station === null),
    );
    await assert.rejects(
      client.query(
        `UPDATE "TeamMatchData" SET station = 0 WHERE key = 'missing-team'`,
      ),
      (error) => error.code === "23514",
    );
    await assert.rejects(
      client.query(
        `UPDATE "TeamMatchData" SET station = 4 WHERE key = 'missing-team'`,
      ),
      (error) => error.code === "23514",
    );
    await client.query(
      `UPDATE "TeamMatchData" SET station = 3 WHERE key = 'missing-team'`,
    );
    await assert.rejects(
      client.query(
        `UPDATE "TeamMatchData" SET "teamNumber" = 99999 WHERE key = 'missing-team'`,
      ),
      (error) => error.code === "23503",
    );
  });
});

test("competition migration rolls back the backfill and schema on failure", async () => {
  await withBaselineDatabase(async (client) => {
    // Force a DDL conflict after the backfill has run.
    await client.query(`CREATE TYPE "AllianceColor" AS ENUM ('RED', 'BLUE')`);
    await assert.rejects(
      client.query(competitionSql),
      (error) => error.code === "42710",
    );
    await client.query("ROLLBACK");
    assert.equal(
      (await client.query('SELECT * FROM "Team" WHERE number = 254')).rowCount,
      0,
    );
    assert.equal(
      (await client.query('SELECT * FROM "ScoutReport"')).rowCount,
      1,
    );
    assert.equal((await client.query('SELECT * FROM "Event"')).rowCount, 1);
    assert.equal(
      (await client.query(`SELECT to_regclass('public."Season"') AS name`))
        .rows[0].name,
      null,
    );
  });
});

test("import migration preserves existing data and supports endpoint state and deduplicated jobs", async () => {
  await withBaselineDatabase(async (client) => {
    await client.query(competitionSql);
    const reportsBefore = (await client.query('SELECT * FROM "ScoutReport"'))
      .rows;
    const actionsBefore = (await client.query('SELECT * FROM "Event"')).rows;
    await client.query(importSql);
    assert.deepEqual(
      (await client.query('SELECT * FROM "ScoutReport"')).rows,
      reportsBefore,
    );
    assert.deepEqual(
      (await client.query('SELECT * FROM "Event"')).rows,
      actionsBefore,
    );

    await client.query(`
      INSERT INTO "FetchState" (provider, "resourceKey", etag)
        VALUES ('tba', 'event/2026fixture/matches', 'original'),
               ('first', 'event/2026fixture/matches', NULL),
               ('tba', 'event/2026fixture/teams', NULL);
      INSERT INTO "ImportJob" (id, kind, "targetKey")
        VALUES ('matches-job', 'eventMatches', '2026fixture'),
               ('roster-job', 'eventRoster', '2026fixture');
    `);
    await assert.rejects(
      client.query(`
      INSERT INTO "FetchState" (provider, "resourceKey")
        VALUES ('tba', 'event/2026fixture/matches')
    `),
      (error) => error.code === "23505",
    );
    await assert.rejects(
      client.query(`
      INSERT INTO "ImportJob" (id, kind, "targetKey")
        VALUES ('duplicate', 'eventMatches', '2026fixture')
    `),
      (error) => error.code === "23505",
    );
    const job = (
      await client.query(`SELECT * FROM "ImportJob" WHERE id = 'matches-job'`)
    ).rows[0];
    assert.equal(job.attempts, 0);
    assert.equal(job.leaseToken, null);
    assert.equal(job.leaseExpiresAt, null);
    assert.equal(job.lastError, null);
    assert.ok(job.runAt instanceof Date);

    // Cache validators must roll back with the data they describe.
    await client.query("BEGIN");
    await client.query(
      `UPDATE "FetchState" SET etag = 'new' WHERE provider = 'tba' AND "resourceKey" = 'event/2026fixture/matches'`,
    );
    await client.query(
      `UPDATE "Tournament" SET name = 'Uncommitted' WHERE key = '2026fixture'`,
    );
    await assert.rejects(
      client.query(
        `UPDATE "TeamMatchData" SET station = 4 WHERE key = 'missing-team'`,
      ),
      (error) => error.code === "23514",
    );
    await client.query("ROLLBACK");
    assert.equal(
      (
        await client.query(
          `SELECT etag FROM "FetchState" WHERE provider = 'tba' AND "resourceKey" = 'event/2026fixture/matches'`,
        )
      ).rows[0].etag,
      "original",
    );
    assert.equal(
      (
        await client.query(
          `SELECT name FROM "Tournament" WHERE key = '2026fixture'`,
        )
      ).rows[0].name,
      "Fixture",
    );

    // Completed jobs can be removed and scheduled again for the same target.
    await client.query(`DELETE FROM "ImportJob" WHERE id = 'matches-job'`);
    await client.query(
      `INSERT INTO "ImportJob" (id, kind, "targetKey") VALUES ('next-job', 'eventMatches', '2026fixture')`,
    );
  });
});

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
