import { startApi } from "../dist/runtime.js";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createApi } from "../dist/app.js";
import { createRepository } from "../dist/repository.js";
import { createAnalysisService } from "../dist/analysis.js";
import { createState } from "../dist/state.js";
import { season2026 } from "../dist/metrics/season2026.js";
const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test" ||
  !["localhost", "127.0.0.1"].includes(redisUrl.hostname)
)
  throw Error("Use disposable loopback lovat_test PostgreSQL and Redis");
const { createDb } = await import("@lovat/db");
const db = createDb(url.href, { maxConnections: 4, statementTimeoutMs: 8000 });
const id = randomUUID(),
  own = 1200000000 + Math.floor(Math.random() * 10000000),
  robot = own + 1;
const eventKey = "rewrite-benchmark-" + id,
  slot = eventKey + "_qm1_0";
const state = createState(redisUrl.href, "lovat:rewrite-benchmark:" + id + ":");
const scope = {
  userId: "benchmark-" + id,
  teamNumber: own,
  role: "ANALYST",
  sources: {
    teams: { mode: "INCLUDE", items: [own] },
    tournaments: { mode: "INCLUDE", items: [eventKey] },
  },
};
const body = JSON.stringify({
  teams: [robot],
  metrics: season2026.metadata().map((m) => m.id),
  season: 2026,
  timeline: false,
});
let api;
let runtime;
const percentile = (a, p) =>
  a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)];
try {
  await db.season.upsert({
    where: { year: 2026 },
    create: { year: 2026 },
    update: {},
  });
  await db.team.createMany({
    data: [
      { number: own, name: "Synthetic benchmark source" },
      { number: robot, name: "Synthetic benchmark robot" },
    ],
  });
  await db.registeredTeam.create({
    data: { number: own, email: id + "@example.invalid", code: id },
  });
  const scout = await db.scouter.create({
    data: { sourceTeamNumber: own, name: "Synthetic benchmark" },
  });
  await db.tournament.create({
    data: {
      key: eventKey,
      name: "Synthetic benchmark",
      seasonYear: 2026,
      date: "2026-03-01",
    },
  });
  await db.teamMatchData.create({
    data: {
      key: slot,
      tournamentKey: eventKey,
      teamNumber: robot,
      matchType: "QUALIFICATION",
      matchNumber: 1,
    },
  });
  const counts = process.env.BENCHMARK_REPORTS
    ? [Number(process.env.BENCHMARK_REPORTS)]
    : [100, 1000];
  if (counts.some((n) => !Number.isInteger(n) || n < 1 || n > 5000))
    throw Error("Invalid benchmark report count");
  const iterations = process.env.BENCHMARK_ITERATIONS
    ? Number(process.env.BENCHMARK_ITERATIONS)
    : 20;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100)
    throw Error("Invalid benchmark iteration count");
  for (const count of counts) {
    await db.scoutReport.deleteMany({ where: { teamMatchKey: slot } });
    const ids = Array.from({ length: count }, () => randomUUID());
    await db.scoutReport.createMany({
      data: ids.map((uuid) => ({
        uuid,
        scouterUuid: scout.uuid,
        teamMatchKey: slot,
        startTime: new Date(),
        notes: "",
        robotRoles: ["SCORING"],
        driverAbility: 3,
        autoClimb: "NOT_ATTEMPTED",
        endgameClimb: "NOT_ATTEMPTED",
        beached: "NEITHER",
        feederTypes: [],
        intakeType: "NEITHER",
        defenseEffectiveness: 0,
        fieldTraversal: "NONE",
        scoresWhileMoving: false,
        disrupts: false,
      })),
    });
    for (let start = 0; start < count; start += 50) {
      const events = ids.slice(start, start + 50).flatMap((uuid) =>
        Array.from({ length: 10 }, (_, i) => [
          {
            scoutReportUuid: uuid,
            time: 24 + i * 10,
            action: "START_SCORING",
            position: "HUB",
            points: 0,
            quantity: 0,
          },
          {
            scoutReportUuid: uuid,
            time: 29 + i * 10,
            action: "STOP_SCORING",
            position: "HUB",
            points: 10,
            quantity: 10,
          },
        ]).flat(),
      );
      await db.event.createMany({ data: events });
    }
    for (const cached of [false, true]) {
      const repository = createRepository(db);
      const analyze = createAnalysisService(
        repository,
        cached ? state.cache : undefined,
      );
      api = createApi({
        repository,
        analyze,
        authenticate: async () => scope,
        ready: async () => true,
      });
      runtime = startApi(api, { port: 0, hostname: "127.0.0.1" });
      const endpoint = runtime.url + "/v3/analysis";
      const call = async () => {
        const start = performance.now();
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer synthetic",
          },
          body,
        });
        const data = await response.json();
        if (
          !response.ok ||
          data.teams[String(robot)].metrics.totalPoints.value !== 100
        )
          throw Error("Benchmark request failed: " + JSON.stringify(data));
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) await call();
      for (const concurrency of [1, 4]) {
        const timings = [],
          cpu = process.cpuUsage();
        for (let i = 0; i < iterations; i++)
          timings.push(
            ...(await Promise.all(Array.from({ length: concurrency }, call))),
          );
        timings.sort((a, b) => a - b);
        console.log(
          JSON.stringify({
            workload: "http-postgres" + (cached ? "-redis-warm" : ""),
            reports: count,
            events: count * 20,
            metrics: 31,
            concurrency,
            requests: timings.length,
            runtime: "bun",
            bun: Bun.version,
            p50Ms: percentile(timings, 0.5),
            p95Ms: percentile(timings, 0.95),
            p99Ms: percentile(timings, 0.99),
            cpuMicroseconds: process.cpuUsage(cpu),
            memory: process.memoryUsage(),
            maxRssKiB: process.resourceUsage().maxRSS,
            identity:
              "injected synthetic scope; no JWKS or identity database read",
            notes: "client and server share a process; local warm database",
          }),
        );
      }
      await runtime.stop(true);
      api = undefined;
      // Remove only this run's explicitly namespaced cache entries.
      await state.connect();
      for await (const keys of state.client.scanIterator({
        MATCH: state.prefix + "analysis:*",
        COUNT: 100,
      })) {
        if (keys.some((key) => !key.startsWith(state.prefix)))
          throw Error("Unexpected cache key");
        if (keys.length) await state.client.del(keys);
      }
    }
  }
} finally {
  if (api) {
    await runtime.stop(true);
  }
  await db.tournament.deleteMany({ where: { key: eventKey } });
  await db.registeredTeam.deleteMany({ where: { number: own } });
  await db.team.deleteMany({ where: { number: { in: [own, robot] } } });
  await state.close();
  await db.$disconnect();
}
