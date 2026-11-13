import { performance } from "node:perf_hooks";
import { analyzeReports } from "../dist/metrics/engine.js";
import { season2026 } from "../dist/metrics/season2026.js";
import { report, event } from "../test/fixtures.mjs";

const counts = [100, 1000, 5000];
const metrics = season2026.metadata().map((m) => m.id);
const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
for (const count of counts) {
  const reports = Array.from({ length: count }, (_, i) =>
    report({
      uuid: "report-" + i,
      teamNumber: 1 + (i % 40),
      matchKey: "match-" + Math.floor(i / 40),
      events: Array.from({ length: 10 }, (_, cycle) => [
        event("START_SCORING", 24 + cycle * 10),
        event("STOP_SCORING", 29 + cycle * 10, 10),
      ]).flat(),
    }),
  );
  const request = {
    teams: Array.from({ length: 40 }, (_, i) => i + 1),
    metrics,
    season: 2026,
    timeline: false,
  };
  for (let i = 0; i < 5; i++) analyzeReports(reports, request, season2026);
  const timings = [];
  const cpuStart = process.cpuUsage();
  for (let i = 0; i < 20; i++) {
    const started = performance.now();
    analyzeReports(reports, request, season2026);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      workload: "pure-engine",
      reports: count,
      events: count * 20,
      metrics: metrics.length,
      iterations: timings.length,
      node: process.version,
      p50Ms: percentile(timings, 0.5),
      p95Ms: percentile(timings, 0.95),
      p99Ms: percentile(timings, 0.99),
      cpuMicroseconds: process.cpuUsage(cpuStart),
      memory: process.memoryUsage(),
    }),
  );
}
