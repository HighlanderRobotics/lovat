import { startApi } from "../dist/runtime.js";
import { createApi } from "../dist/app.js";
import { createRepository } from "../dist/repository.js";
import { createAnalysisService } from "../dist/analysis.js";
import { createState } from "../dist/state.js";
import { createServices } from "../dist/services/index.js";
import { HttpError } from "../dist/errors.js";

if (!process.send || process.env.LOVAT_DB_TEST !== "1")
  throw Error("Run through the isolated benchmark");
const url = new URL(process.env.DATABASE_URL ?? "");
const redis = new URL(process.env.REDIS_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test" ||
  !["localhost", "127.0.0.1"].includes(redis.hostname)
)
  throw Error("Use disposable loopback services");
const { scope, prefix, cached } = JSON.parse(
  process.env.BENCHMARK_CONFIG ?? "{}",
);
if (
  !prefix?.startsWith("lovat:rewrite-benchmark:") ||
  !scope?.userId?.startsWith("benchmark-")
)
  throw Error("Invalid synthetic scope");
const { createDb } = await import("@lovat/db");
const queryStats = {};
const db = createDb(url.href, {
  maxConnections: 4,
  statementTimeoutMs: 8000,
}).$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const started = performance.now();
        try {
          return await query(args);
        } finally {
          const elapsed = performance.now() - started;
          const stats = (queryStats[model + "." + operation] ??= {
            count: 0,
            totalMs: 0,
            maxMs: 0,
          });
          stats.count++;
          stats.totalMs += elapsed;
          stats.maxMs = Math.max(stats.maxMs, elapsed);
        }
      },
    },
  },
});
const state = createState(redis.href, prefix);
const repository = createRepository(db);
const analyze = createAnalysisService(
  repository,
  cached ? state.cache : undefined,
);
const api = createApi({
  repository,
  analyze,
  authenticate: async () => scope,
  services: {
    router: createServices({
      analyze,
      baseUrl: "http://127.0.0.1",
      commit: "benchmark",
    }),
    db,
    authenticate: async () => {
      throw new HttpError(
        401,
        "UNAUTHORIZED",
        "Benchmark service access is disabled",
      );
    },
  },
  ready: async () => true,
});
const runtime = startApi(api, { port: 0, hostname: "127.0.0.1" });
const snapshot = () => ({
  memory: process.memoryUsage(),
  cpuMicroseconds: process.cpuUsage(),
  maxRssKiB: process.resourceUsage().maxRSS,
  queries: queryStats,
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await runtime.stop();
  await state.close();
  await db.$disconnect();
  process.disconnect();
}
process.on("message", async (message) => {
  if (message.type === "stats")
    process.send({ type: "stats", id: message.id, ...snapshot() });
  if (message.type === "stop") await stop();
});
process.on("disconnect", () => {
  void stop();
});
process.send({
  type: "ready",
  url: runtime.url,
  pid: process.pid,
  ...snapshot(),
});
