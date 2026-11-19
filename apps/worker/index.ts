import { db } from "./src/db";
import { tba } from "./src/tba";
import { runBatch, runWorker } from "./src/worker";
import { createHealthApp, healthPort } from "./src/server";

// Validate the provider configuration before starting any background work.
void tba;

const shutdown = new AbortController();
const stop = () => shutdown.abort();
let lastReconciledAt = 0;

const mode = process.env.WORKER_MODE ?? "continuous";
if (!["batch", "continuous"].includes(mode))
  throw new Error("WORKER_MODE must be batch or continuous");

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

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

let server: ReturnType<typeof Bun.serve> | undefined;
try {
  // Batch has no listener or readiness queries between windows.
  if (mode === "batch") {
    await runBatch(db, shutdown.signal, concurrency);
  } else {
    // Migrations are owned by the release/API service.
    await db.$queryRaw`SELECT 1 FROM "ImportJob", "FetchState", "TournamentGap" LIMIT 0`;
    server = Bun.serve({ hostname: "0.0.0.0", port, fetch: app.fetch });
    await runWorker(db, shutdown.signal, concurrency, () => {
      lastReconciledAt = Date.now();
    });
  }
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  await server?.stop(true);
  await db.$disconnect();
}
