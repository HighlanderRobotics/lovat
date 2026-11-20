import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { startQualificationService } from "./qualification-process.mjs";
import { createState } from "../dist/state.js";

const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
const redis = new URL(process.env.REDIS_URL ?? "redis://localhost/missing");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  database.hostname !== "127.0.0.1" ||
  database.pathname !== "/lovat_test" ||
  redis.hostname !== "127.0.0.1"
)
  throw Error("Use disposable loopback lovat_test and Redis");
const node = process.env.LOVAT_NODE_EXECUTABLE ?? Bun.which("node");
if (
  !node ||
  new TextDecoder().decode(Bun.spawnSync([node, "--version"]).stdout).trim() !==
    "v22.20.0"
)
  throw Error("Run with Node 22.20.0 on PATH or LOVAT_NODE_EXECUTABLE");
const { createDb } = await import("@lovat/db");
test(
  "traffic rollback retains reports, API keys and tenant boundaries without rolling back schema",
  { timeout: 60000 },
  async (t) => {
    const db = createDb(database.href, { maxConnections: 4 });
    const suffix = randomUUID(),
      prefix = "lovat:qualification:" + suffix + ":";
    const state = createState(redis.href, prefix);
    const own = 1500000000 + Math.floor(Math.random() * 10000000),
      other = own + 1,
      robot = own + 2;
    const event = "2026-qualification-" + suffix,
      slot = event + "_qm1_0",
      scout = randomUUID();
    const user = "qualification|" + suffix,
      foreignUser = user + "-foreign";
    const uuids = [randomUUID(), randomUUID()];
    let native, legacy;
    const keys = Array.from(
      { length: 4 },
      () =>
        "lvt-" +
        randomUUID().replaceAll("-", "") +
        randomUUID().replaceAll("-", ""),
    );
    t.after(async () => {
      try {
        await native?.stop();
      } finally {
        try {
          await legacy?.stop();
        } finally {
          await state.connect();
          for await (const names of state.client.scanIterator({
            MATCH: prefix + "*",
            COUNT: 100,
          })) {
            if (names.some((name) => !name.startsWith(prefix)))
              throw Error("Unexpected Redis namespace");
            if (names.length) await state.client.del(names);
          }
          await state.close();
          await db.scoutReportInProgress.deleteMany({
            where: { uuid: { in: uuids } },
          });
          await db.apiOutbox.deleteMany({
            where: { dedupeKey: { startsWith: "analysis:" + robot + ":" } },
          });
          await db.analysisRevision.deleteMany({
            where: { teamNumber: robot },
          });
          await db.tournament.deleteMany({ where: { key: event } });
          await db.user.deleteMany({
            where: { id: { in: [user, foreignUser] } },
          });
          await db.registeredTeam.deleteMany({
            where: { number: { in: [own, other] } },
          });
          await db.team.deleteMany({
            where: { number: { in: [own, other, robot] } },
          });
          await db.$disconnect();
        }
      }
    });
    const migrations =
      await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
    await db.season.upsert({
      where: { year: 2026 },
      create: { year: 2026 },
      update: {},
    });
    await db.team.createMany({
      data: [own, other, robot].map((number) => ({
        number,
        name: "Synthetic rollback fixture",
      })),
    });
    for (const number of [own, other])
      await db.registeredTeam.create({
        data: {
          number,
          code: suffix + number,
          email: suffix + number + "@example.invalid",
          emailVerified: true,
        },
      });
    await db.scouter.create({
      data: { uuid: scout, sourceTeamNumber: own, name: "Synthetic scouter" },
    });
    for (const [id, number] of [
      [user, own],
      [foreignUser, other],
    ])
      await db.user.create({
        data: {
          id,
          email: id.replace("|", "-") + "@example.invalid",
          teamNumber: number,
          role: "SCOUTING_LEAD",
          teamSourceRule: { mode: "INCLUDE", items: [number] },
          tournamentSourceRule: { mode: "INCLUDE", items: [event] },
        },
      });
    for (const [index, key] of keys.entries())
      await db.apiKey.create({
        data: {
          name: "Synthetic rollback key",
          userId: index === 3 ? foreignUser : user,
          keyHash: createHash("sha256").update(key).digest("hex"),
        },
      });
    await db.tournament.create({
      data: {
        key: event,
        name: "Synthetic rollback fixture",
        seasonYear: 2026,
      },
    });
    await db.teamMatchData.create({
      data: {
        key: slot,
        tournamentKey: event,
        teamNumber: robot,
        matchType: "QUALIFICATION",
        matchNumber: 1,
      },
    });
    const env = {
      DATABASE_URL: database.href,
      REDIS_URL: redis.href,
      REDIS_KEY_PREFIX: prefix,
      LOVAT_DB_TEST: "1",
      AUTH0_ISSUER: "https://auth.test.invalid/",
      AUTH0_AUDIENCE: "https://api.lovat.app",
      AUTH0_DOMAIN: "auth.test.invalid",
      POSTHOG_PROJECT_API_KEY: "synthetic-qualification",
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: "0",
    };
    native = await startQualificationService(process.execPath, "api", env);
    legacy = await startQualificationService(node, "server", env);
    assert.equal((await fetch(native.url + "/health/ready")).status, 200);
    const startTime = Date.now() - 50000;
    const data = {
      notes: "Synthetic rollback note",
      robotRoles: ["SCORING"],
      mobility: "NONE",
      beached: "NEITHER",
      feederTypes: [],
      intakeType: "NEITHER",
      driverAbility: 3,
      accuracy: null,
      disrupts: false,
      defenseEffectiveness: 0,
      scoresWhileMoving: false,
      autoClimb: "NOT_ATTEMPTED",
      endgameClimb: "NOT_ATTEMPTED",
      events: [
        [0, 2, 8],
        [10, 0, 2],
        [20, 1, 2, 5],
      ],
    };
    const envelope = {
      uuid: uuids[0],
      scouterUuid: scout,
      teamNumber: robot,
      tournamentKey: event,
      matchType: "QUALIFICATION",
      matchNumber: 1,
      season: 2026,
      gameId: "frc-2026",
      gameVersion: 1,
      reportVersion: 1,
      startTime,
      endTime: startTime + 30000,
      data,
    };
    const response = await fetch(native.url + "/v3/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Team-Code": suffix + own,
        "X-Scouter-Uuid": scout,
        "X-Device-Id": suffix,
      },
      body: JSON.stringify(envelope),
    });
    assert.equal(response.status, 201, JSON.stringify(await response.json()));
    const read = (base, uuid, key) =>
      fetch(base + "/v1/manager/scoutreports/" + uuid, {
        headers: { Authorization: "Bearer " + key },
      });
    const before = await read(legacy.url, uuids[0], keys[0]);
    assert.equal(before.status, 200);
    const saved = await before.json();
    assert.equal(saved.scoutReport.notes, data.notes);
    assert.equal(saved.events.length, data.events.length);
    assert.equal((await read(legacy.url, uuids[0], keys[3])).status, 404);
    assert.equal((await read(native.url, uuids[0], keys[3])).status, 404);
    const oldUpload = await fetch(legacy.url + "/collection/scoutreports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, ...envelope, uuid: uuids[1] }),
    });
    assert.equal(oldUpload.status, 200, await oldUpload.text());
    const forward = await read(native.url, uuids[1], keys[2]);
    assert.equal(forward.status, 200);
    assert.equal((await forward.json()).scoutReport.notes, data.notes);
    await native.stop();
    native = undefined;
    const after = await read(legacy.url, uuids[0], keys[1]);
    assert.equal(after.status, 200);
    assert.equal((await after.json()).scoutReport.uuid, uuids[0]);
    assert.equal(
      await db.scoutReport.count({ where: { uuid: { in: uuids } } }),
      2,
    );
    assert.deepEqual(
      await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`,
      migrations,
    );
  },
);
