import { db } from "./src/db";
import { tba } from "./src/tba";
import { runWorker } from "./src/worker";
import { createHealthApp, healthPort } from "./src/server";

// Validate the provider configuration before starting any background work.
void tba;

const shutdown = new AbortController();
const stop = () => shutdown.abort();
let lastReconciledAt = 0;

const port = healthPort();
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
const app = createHealthApp({
  isReady: () =>
    !shutdown.signal.aborted &&
    lastReconciledAt > 0 &&
    Date.now() - lastReconciledAt < 120_000,
  checkDatabase: async () => {
    await db.$queryRaw`SELECT 1`;
  },
});

// Migrations are owned by the release/API service, never each worker replica.
await db.$queryRaw`SELECT 1 FROM "ImportJob", "FetchState", "TournamentGap" LIMIT 0`;

const server = Bun.serve({ hostname: "0.0.0.0", port, fetch: app.fetch });
console.info(
  `Worker started with ${concurrency} consumers; health port ${port}`,
);

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await runWorker(db, shutdown.signal, concurrency, () => {
    lastReconciledAt = Date.now();
  });
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  await server.stop(true);
  await db.$disconnect();
}
