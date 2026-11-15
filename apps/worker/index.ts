import { createOutboxDelivery, runOutbox } from "./src/outbox";
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

const effects =
  process.env.API_EFFECTS_ENABLED === "true"
    ? createOutboxDelivery(db, {
        redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
        prefix: process.env.REDIS_KEY_PREFIX ?? "lovat:rewrite:",
        resendKey: process.env.RESEND_KEY,
        emailFrom: process.env.EMAIL_FROM,
      })
    : undefined;
try {
  const effectsLoop = effects
    ? runOutbox(db, effects, shutdown.signal)
    : Promise.resolve();
  await runWorker(db, shutdown.signal, concurrency, () => {
    lastReconciledAt = Date.now();
  });
  await effectsLoop;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  effects?.close();
  await server.stop(true);
  await db.$disconnect();
}
