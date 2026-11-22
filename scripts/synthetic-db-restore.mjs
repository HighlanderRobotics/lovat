import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const source = "lovat_rehearsal_source";
const target = "lovat_rehearsal_target";
const owner = "lovat_rehearsal";
const port = 5432;
const dbDir = fileURLToPath(new URL("../packages/db/", import.meta.url));

const fixture = `
  BEGIN;
  INSERT INTO "Team" (number, name) VALUES (-42, 'Synthetic restore team');
  INSERT INTO "RegisteredTeam" (number, code, email)
    VALUES (-42, 'synthetic-restore', 'restore@example.invalid');
  INSERT INTO "Scouter" (uuid, "sourceTeamNumber")
    VALUES ('restore-scouter', -42);
  INSERT INTO "Tournament" (key, name) VALUES ('restore-event', 'Synthetic restore event');
  INSERT INTO "TeamMatchData" (key, "tournamentKey", "matchNumber", "teamNumber", "matchType")
    VALUES ('restore-slot', 'restore-event', 1, -42, 'QUALIFICATION');
  INSERT INTO "ScoutReport"
    (uuid, "teamMatchKey", "startTime", notes, "robotRoles", "driverAbility",
     "scouterUuid", beached, "defenseEffectiveness", "feederTypes", "intakeType",
     "fieldTraversal", "scoresWhileMoving", disrupts, "endgameClimb", "autoClimb")
    VALUES ('restore-report', 'restore-slot', '2026-01-01T00:00:00Z',
      'Synthetic report only', ARRAY['SCORING']::"RobotRole"[], 3,
      'restore-scouter', 'NEITHER', 0, '{}', 'NEITHER', 'NONE',
      false, false, 'NOT_ATTEMPTED', 'NOT_ATTEMPTED');
  INSERT INTO "Event" ("eventUuid", time, action, position, points, quantity, "scoutReportUuid")
    VALUES ('restore-action', 10, 'INTAKE', 'DEPOT', 0, 2, 'restore-report');
  COMMIT;`;

const readReport = `
  SELECT e.action, e.quantity, s."sourceTeamNumber", m."tournamentKey",
    m."teamNumber", r.notes
  FROM "Event" e JOIN "ScoutReport" r ON r.uuid = e."scoutReportUuid"
  JOIN "Scouter" s ON s.uuid = r."scouterUuid"
  JOIN "TeamMatchData" m ON m.key = r."teamMatchKey"
  WHERE e."eventUuid" = 'restore-action' AND r.uuid = 'restore-report';`;

const readMigrations = `
  SELECT migration_name, checksum FROM "_prisma_migrations"
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;`;

export function postgresEnvironment(path, sandbox) {
  // No inherited PG*, DATABASE_URL, NODE_OPTIONS, or dotenv file reaches a command.
  return {
    PATH: path,
    HOME: sandbox,
    LANG: "C",
    DOTENV_CONFIG_PATH: "/dev/null",
  };
}

export function restoreArguments(socket, archive) {
  return [
    "--host",
    socket,
    "--port",
    String(port),
    "--username",
    owner,
    "--dbname",
    target,
    "--no-password",
    "--single-transaction",
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    archive,
  ];
}

export function postgresUrl(socket, database) {
  assert.ok(database === source || database === target, "Unexpected database");
  // Prisma uses the host query parameter for Unix sockets. The reserved
  // .invalid hostname also fails closed if a client ever ignores that option.
  const url = new URL(
    `postgresql://${owner}@localhost.invalid:${port}/${database}`,
  );
  url.searchParams.set("host", socket);
  return url.href;
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: 120_000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const diagnostic = result.stderr?.trim() || result.stdout?.trim();
    throw new Error(
      `${command} failed: ${result.error?.message ?? diagnostic ?? result.status}`,
    );
  }
  return result.stdout.trim();
}

export function rehearseRestore() {
  if (process.getuid?.() === 0) {
    throw new Error("Run as a non-root user with PostgreSQL 16 tools in PATH.");
  }
  const directory = mkdtempSync(join(realpathSync("/tmp"), "lovat-restore-"));
  const data = join(directory, "data");
  const socket = join(directory, "socket");
  const archive = join(directory, "synthetic.dump");
  const serverLog = join(directory, "postgres.log");
  const env = postgresEnvironment(process.env.PATH, directory);
  const invoke = (command, args, extra = {}) =>
    run(command, args, { env, ...extra });
  const connection = [
    "--host",
    socket,
    "--port",
    String(port),
    "--username",
    owner,
    "--no-password",
  ];
  const sql = (database, text) =>
    invoke("psql", [
      ...connection,
      "--dbname",
      database,
      "-XqAt",
      "-v",
      "ON_ERROR_STOP=1",
      "--command",
      text,
    ]);
  const prisma = (database, args) => {
    // Invoke the checkout's locked CLI; never install software or read a user .env.
    return invoke(
      process.execPath,
      [join(dbDir, "node_modules/prisma/build/index.js"), ...args],
      {
        cwd: dbDir,
        env: { ...env, DATABASE_URL: postgresUrl(socket, database) },
      },
    );
  };
  let attemptedStart = false;
  let safeToRemove = true;

  try {
    mkdirSync(socket, { mode: 0o700 });
    invoke("initdb", [
      "--pgdata",
      data,
      "--auth-local=trust",
      "--auth-host=reject",
      "--username",
      owner,
      "--encoding=UTF8",
      "--locale=C",
    ]);
    attemptedStart = true;
    try {
      invoke("pg_ctl", [
        "-D",
        data,
        "-l",
        serverLog,
        "-w",
        "-t",
        "15",
        "-o",
        `-c listen_addresses='' -k ${socket} -p ${port}`,
        "start",
      ]);
    } catch (error) {
      let startup = "";
      try {
        startup = readFileSync(serverLog, "utf-8")
          .trim()
          .split("\n")
          .slice(-6)
          .join("\n");
      } catch {
        // pg_ctl may fail before it creates the private cluster log.
      }
      throw new Error([error.message, startup].filter(Boolean).join("\n"));
    }

    for (const database of [source, target]) {
      invoke("createdb", [...connection, "--template", "template0", database]);
    }
    prisma(source, ["migrate", "deploy"]);
    sql(source, fixture);
    const migrations = sql(source, readMigrations);
    assert.ok(migrations, "Source migration history is empty");

    const snapshotAt = Date.now();
    const dumpStart = performance.now();
    invoke("pg_dump", [
      ...connection,
      "--dbname",
      source,
      "--format=custom",
      "--file",
      archive,
    ]);
    const dumpMs = Math.round(performance.now() - dumpStart);
    sql(
      source,
      `INSERT INTO "Team" (number, name) VALUES (-43, 'After backup');`,
    );
    assert.equal(
      sql(source, 'SELECT count(*) FROM "Team" WHERE number = -43;'),
      "1",
    );

    const restoreStart = performance.now();
    invoke("pg_restore", restoreArguments(socket, archive));
    const restoreMs = Math.round(performance.now() - restoreStart);
    assert.equal(
      sql(target, readReport),
      "INTAKE|2|-42|restore-event|-42|Synthetic report only",
    );
    assert.equal(
      sql(target, 'SELECT count(*) FROM "Team" WHERE number = -43;'),
      "0",
    );
    assert.equal(
      sql(target, readMigrations),
      migrations,
      "Migration history differs",
    );
    prisma(target, ["migrate", "status"]);
    prisma(target, [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ]);
    return {
      dumpMs,
      restoreMs,
      verifiedRestoreMs: Math.round(performance.now() - restoreStart),
      snapshotAgeMs: Date.now() - snapshotAt,
      archiveBytes: statSync(archive).size,
      migrations: migrations.split("\n").length,
    };
  } finally {
    if (attemptedStart) {
      const stopped = spawnSync(
        "pg_ctl",
        ["-D", data, "-m", "fast", "-w", "-t", "15", "stop"],
        {
          encoding: "utf-8",
          env,
          timeout: 20_000,
        },
      );
      // pg_ctl may exit before starting a process; inspect its PID file rather
      // than deleting a data directory while a server could still be running.
      try {
        statSync(join(data, "postmaster.pid"));
        safeToRemove = stopped.status === 0;
      } catch (error) {
        if (error.code !== "ENOENT") safeToRemove = false;
      }
    }
    if (safeToRemove) rmSync(directory, { recursive: true, force: true });
    else
      throw new Error(
        `Could not stop disposable PostgreSQL; retained ${directory} for cleanup`,
      );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 2) {
    console.error(
      "Usage: node scripts/synthetic-db-restore.mjs (no arguments accepted)",
    );
    process.exitCode = 2;
  } else {
    try {
      const metrics = rehearseRestore();
      console.log(
        "Synthetic restore verified: report/relations, snapshot boundary, migration history and schema.",
      );
      console.log(JSON.stringify(metrics));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
