import { startBenchmarkServer } from "./benchmark-process.mjs";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
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
const bounded = (name, fallback, min, max) => {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error("Invalid " + name);
  return value;
};
const counts = process.env.BENCHMARK_REPORTS
  ? [bounded("BENCHMARK_REPORTS", 1000, 1, 5000)]
  : [100, 1000];
const iterations = bounded("BENCHMARK_ITERATIONS", 20, 1, 100);
const matches = bounded("BENCHMARK_MATCHES", 1, 1, Math.max(...counts));
const soakSeconds = bounded("BENCHMARK_SOAK_SECONDS", 0, 0, 600);
const concurrencies = process.env.BENCHMARK_CONCURRENCY
  ? [bounded("BENCHMARK_CONCURRENCY", 1, 1, 4)]
  : [1, 4];
const cacheMode = process.env.BENCHMARK_CACHE ?? "both";
if (!["cold", "warm", "both"].includes(cacheMode))
  throw Error("Invalid BENCHMARK_CACHE");
const cases = cacheMode === "both" ? [false, true] : [cacheMode === "warm"];
const { createDb } = await import("@lovat/db");
const db = createDb(url.href, { maxConnections: 4, statementTimeoutMs: 8000 });
const id = randomUUID(),
  own = 1200000000 + Math.floor(Math.random() * 10000000),
  robot = own + 1;
const eventKey = "rewrite-benchmark-" + id;
const slots = Array.from(
  { length: matches },
  (_, i) => eventKey + "_qm" + (i + 1) + "_0",
);
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
  await db.teamMatchData.createMany({
    data: slots.map((key, i) => ({
      key,
      tournamentKey: eventKey,
      teamNumber: robot,
      matchType: "QUALIFICATION",
      matchNumber: i + 1,
    })),
  });
  for (const count of counts) {
    await db.scoutReport.deleteMany({
      where: { teamMatchData: { tournamentKey: eventKey } },
    });
    const ids = Array.from({ length: count }, () => randomUUID());
    await db.scoutReport.createMany({
      data: ids.map((uuid, index) => ({
        uuid,
        scouterUuid: scout.uuid,
        teamMatchKey: slots[index % slots.length],
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
    for (const cached of cases) {
      runtime = await startBenchmarkServer({
        scope,
        prefix: state.prefix,
        cached,
      });
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
          data.teams[String(robot)].metrics.totalPoints.value !== 100 ||
          data.teams[String(robot)].metrics.totalPoints.samples !==
            Math.min(count, slots.length)
        )
          throw Error("Benchmark request failed: " + JSON.stringify(data));
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) await call();
      for (const concurrency of concurrencies) {
        const timings = [],
          before = await runtime.stats();
        for (let i = 0; i < iterations; i++) {
          const batch = await Promise.allSettled(
            Array.from({ length: concurrency }, call),
          );
          const failure = batch.find((result) => result.status === "rejected");
          if (failure) throw failure.reason;
          timings.push(...batch.map((result) => result.value));
        }
        timings.sort((a, b) => a - b);
        const after = await runtime.stats();
        console.log(
          JSON.stringify({
            workload: "http-postgres" + (cached ? "-redis-warm" : ""),
            reports: count,
            matches: Math.min(count, slots.length),
            events: count * 20,
            metrics: 31,
            concurrency,
            requests: timings.length,
            runtime: "bun",
            bun: Bun.version,
            p50Ms: percentile(timings, 0.5),
            p95Ms: percentile(timings, 0.95),
            p99Ms: percentile(timings, 0.99),
            cpuMicroseconds: {
              user: after.cpuMicroseconds.user - before.cpuMicroseconds.user,
              system:
                after.cpuMicroseconds.system - before.cpuMicroseconds.system,
            },
            memory: after.memory,
            maxRssKiB: after.maxRssKiB,
            idleMemory: runtime.initial.memory,
            queries: after.queries,
            identity:
              "injected synthetic scope; no JWKS or identity database read",
            notes:
              "server isolated from fixture/client process; full service composition, synthetic identity; local warm database",
          }),
        );
      }
      if (soakSeconds) {
        const timings = [],
          liveness = [],
          rssSamples = [];
        const before = await runtime.stats(),
          start = performance.now();
        let stopped = false,
          lastSample = -5000;
        const probe = (async () => {
          while (!stopped) {
            const at = performance.now();
            const response = await fetch(runtime.url + "/health/live", {
              signal: AbortSignal.timeout(2000),
            });
            await response.text();
            if (!response.ok) throw Error("Liveness failed during soak");
            liveness.push(performance.now() - at);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        })();
        try {
          while (performance.now() - start < soakSeconds * 1000) {
            const batch = await Promise.allSettled(
              Array.from({ length: 4 }, call),
            );
            const failure = batch.find(
              (result) => result.status === "rejected",
            );
            if (failure) throw failure.reason;
            timings.push(...batch.map((result) => result.value));
            const elapsed = performance.now() - start;
            if (elapsed - lastSample >= 5000) {
              const sample = await runtime.stats();
              rssSamples.push({ elapsedMs: elapsed, rss: sample.memory.rss });
              lastSample = elapsed;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } finally {
          stopped = true;
          await probe;
        }
        const after = await runtime.stats();
        timings.sort((a, b) => a - b);
        liveness.sort((a, b) => a - b);
        console.log(
          JSON.stringify({
            workload: "http-postgres-soak" + (cached ? "-redis" : ""),
            runtime: "bun",
            bun: Bun.version,
            reports: count,
            matches: Math.min(count, slots.length),
            events: count * 20,
            metrics: 31,
            concurrency: 4,
            requests: timings.length,
            errors: 0,
            durationMs: performance.now() - start,
            p50Ms: percentile(timings, 0.5),
            p95Ms: percentile(timings, 0.95),
            p99Ms: percentile(timings, 0.99),
            livenessRequests: liveness.length,
            livenessP95Ms: percentile(liveness, 0.95),
            livenessMaxMs: liveness.at(-1),
            memory: after.memory,
            maxRssKiB: after.maxRssKiB,
            rssSamples,
            cpuMicroseconds: {
              user: after.cpuMicroseconds.user - before.cpuMicroseconds.user,
              system:
                after.cpuMicroseconds.system - before.cpuMicroseconds.system,
            },
            queries: after.queries,
            identity:
              "synthetic scope; fixture/client excluded from server metrics",
          }),
        );
      }
      await runtime.stop();
      runtime = undefined;
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
  try {
    if (runtime) await runtime.stop();
  } finally {
    await db.tournament.deleteMany({ where: { key: eventKey } });
    await db.registeredTeam.deleteMany({ where: { number: own } });
    await db.team.deleteMany({ where: { number: { in: [own, robot] } } });
    await state.close();
    await db.$disconnect();
  }
}
