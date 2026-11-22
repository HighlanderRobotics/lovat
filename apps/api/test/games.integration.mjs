import { startApi } from "../dist/runtime.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { GameCatalog } from "@lovat/games";
import { game2026 } from "@lovat/games/2026";
import { createApiClient } from "@lovat/api";
import { fictionalGame } from "../../../packages/games/test/fixtures.mjs";
import { createApi } from "../dist/app.js";
import { createRepository } from "../dist/repository.js";
import { createServices } from "../dist/services/index.js";
import { createAnalysisService } from "../dist/analysis.js";
const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
)
  throw Error("Use a disposable loopback lovat_test database");
const { createDb } = await import("@lovat/db");
test("a second game validates, persists and analyzes through unchanged HTTP and storage infrastructure", async (t) => {
  const db = createDb(url.href, {
      maxConnections: 4,
      statementTimeoutMs: 8000,
    }),
    suffix = randomUUID();
  const own = 1300000000 + Math.floor(Math.random() * 10000000),
    other = own + 1,
    robot = own + 2,
    fourth = own + 3,
    scout = randomUUID();
  const event = "2099-game-fixture-" + suffix,
    slot = event + "_qm1_0";
  const catalog = new GameCatalog([game2026, fictionalGame]);
  await db.season.upsert({
    where: { year: 2099 },
    create: { year: 2099 },
    update: {},
  });
  await db.team.createMany({
    data: [own, other, robot, fourth].map((number) => ({
      number,
      name: "Synthetic game fixture",
    })),
  });
  await db.registeredTeam.createMany({
    data: [own, other].map((number) => ({
      number,
      code: suffix + number,
      email: number + "@example.invalid",
      emailVerified: true,
      teamApproved: true,
    })),
  });
  await db.scouter.create({
    data: { uuid: scout, name: "Synthetic game scout", sourceTeamNumber: own },
  });
  await db.tournament.create({
    data: {
      key: event,
      name: "Synthetic different game",
      seasonYear: 2099,
      date: "2099-03-01",
    },
  });
  await db.teamMatchData.create({
    data: {
      key: slot,
      tournamentKey: event,
      teamNumber: robot,
      matchNumber: 1,
      matchType: "QUALIFICATION",
    },
  });
  const scope = {
    userId: suffix,
    teamNumber: own,
    role: "SCOUTING_LEAD",
    sources: {
      teams: { mode: "INCLUDE", items: [own] },
      tournaments: { mode: "INCLUDE", items: [event] },
    },
  };
  const repository = createRepository(db, catalog),
    analyze = createAnalysisService(repository, undefined, catalog);
  let sessionReads = 0;
  const api = createApi({
    gameCatalog: catalog,
    repository,
    analyze,
    authenticate: async (auth) =>
      auth === "Bearer other"
        ? {
            ...scope,
            teamNumber: other,
            sources: {
              ...scope.sources,
              teams: { mode: "INCLUDE", items: [other] },
            },
          }
        : scope,
    ready: async () => true,
    services: {
      router: createServices({
        baseUrl: "https://example.invalid",
        commit: "fixture",
        analyze,
        gameCatalog: catalog,
      }),
      db,
      authenticate: async () => {
        sessionReads++;
        return {
          user: {
            id: suffix,
            teamNumber: own,
            role: "SCOUTING_LEAD",
            teamSourceRule: scope.sources.teams,
            tournamentSourceRule: scope.sources.tournaments,
            team: { emailVerified: true },
          },
          tokenType: "jwt",
        };
      },
    },
  });
  const runtime = startApi(api, { port: 0, hostname: "127.0.0.1" });
  const base = runtime.url;
  t.after(async () => {
    await runtime.stop(true);
    await db.tournament.deleteMany({ where: { key: event } });
    await db.registeredTeam.deleteMany({
      where: { number: { in: [own, other] } },
    });
    await db.team.deleteMany({
      where: { number: { in: [own, other, robot, fourth] } },
    });
    await db.apiOutbox.deleteMany({
      where: { dedupeKey: { startsWith: "analysis:" + robot + ":" } },
    });
    await db.analysisRevision.deleteMany({ where: { teamNumber: robot } });
    await db.season.deleteMany({
      where: {
        year: 2099,
        tournaments: { none: {} },
        teamSeasons: { none: {} },
        districtSeasons: { none: {} },
        gameReports: { none: {} },
      },
    });
    await db.$disconnect();
  });
  const headers = {
    "Content-Type": "application/json",
    "X-Team-Code": suffix + own,
    "X-Scouter-Uuid": scout,
    "X-Device-Id": suffix,
  };
  const report = {
    uuid: randomUUID(),
    scouterUuid: scout,
    teamNumber: robot,
    tournamentKey: event,
    matchType: "QUALIFICATION",
    matchNumber: 1,
    season: 2099,
    gameId: "fixture-glyphs",
    gameVersion: 1,
    reportVersion: 2,
    startTime: Date.now() - 80000,
    endTime: Date.now() - 5000,
    data: {
      throws: [
        { zone: "high", count: 2 },
        { zone: "low", count: 3 },
      ],
      balanced: true,
    },
  };
  const submit = (data, extra = {}) =>
    fetch(base + "/v3/reports", {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(data),
    });
  const [first, replay] = await Promise.all([submit(report), submit(report)]);
  assert.deepEqual([first.status, replay.status].sort(), [200, 201]);
  assert.equal(sessionReads, 0);
  assert.equal(await db.gameReport.count({ where: { uuid: report.uuid } }), 1);
  assert.equal(await db.scoutReport.count({ where: { uuid: report.uuid } }), 0);
  const saved = await db.gameReport.findUniqueOrThrow({
    where: { uuid: report.uuid },
  });
  assert.deepEqual(saved.data, report.data);
  assert.equal(saved.seasonYear, 2099);
  assert.equal(
    (
      await db.analysisRevision.findUniqueOrThrow({
        where: { teamNumber: robot },
      })
    ).revision,
    1n,
  );
  assert.equal(
    (await submit({ ...report, data: { ...report.data, balanced: false } }))
      .status,
    409,
  );
  assert.equal(
    (
      await submit(
        { ...report, uuid: randomUUID() },
        { "X-Team-Code": suffix + other },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await submit({
        ...report,
        uuid: randomUUID(),
        data: { ...report.data, accuracy: 5 },
      })
    ).status,
    400,
  );
  assert.equal((await submit({ ...report, reportVersion: 99 })).status, 409);
  assert.equal(
    (
      await submit({
        ...report,
        uuid: randomUUID(),
        endTime: report.endTime + 10000,
      })
    ).status,
    400,
  );
  assert.equal((await submit({ ...report, gameId: "frc-2026" })).status, 400);
  assert.equal(
    (
      await submit({
        ...report,
        reportVersion: 1,
        data: { high: 2, low: 3, balanced: true },
      })
    ).status,
    200,
  );
  const client = createApiClient({
    baseUrl: base,
    token: () => "own",
    collection: () => headers,
  });
  const publicClient = createApiClient({ baseUrl: base });
  const available = await publicClient.request("games", {});
  assert.equal(
    available
      .find((game) => game.season === 2099)
      .rules.periods.reduce((n, period) => n + period.durationSeconds, 0),
    75,
  );
  const metrics = await client.request("metrics", { season: 2099 });
  assert.deepEqual(
    metrics.map((metric) => metric.id),
    ["glyphScore", "capability"],
  );
  const result = await client.request("analyze", {
    season: 2099,
    gameVersion: 1,
    teams: [robot],
    metrics: ["points", "capability"],
  });
  assert.equal(result.teams[String(robot)].metrics.glyphScore.value, 33);
  assert.deepEqual(result.teams[String(robot)].metrics.capability.value, {
    canBalance: true,
    capacity: 5,
  });
  const predicted = await client.request("predictGame", {
    season: 2099,
    red: [robot, own],
    blue: [other, fourth],
  });
  assert.equal(predicted.redScore, 33);
  assert.equal(predicted.winningAlliance, "red");
  assert.equal(predicted.redRankingPoints, 3);
  const suspect = {
    ...report,
    uuid: randomUUID(),
    data: { throws: [{ zone: "high", count: 1000 }], balanced: true },
  };
  assert.equal((await submit(suspect)).status, 201);
  assert.equal(
    (await db.gameReport.findUniqueOrThrow({ where: { uuid: suspect.uuid } }))
      .reliability,
    "FLAGGED_SYSTEM",
  );
  const denied = await fetch(base + "/v3/analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer other",
    },
    body: JSON.stringify({ season: 2099, teams: [robot], metrics: ["points"] }),
  });
  assert.equal(denied.status, 200);
  assert.equal(
    (await denied.json()).teams[String(robot)].metrics.glyphScore.value,
    null,
  );
});
