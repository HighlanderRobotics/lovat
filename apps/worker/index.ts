import { createOutboxDelivery, runOutbox } from "./src/outbox";
import { db } from "./src/db";
import { tba } from "./src/tba";
import { runBatch, runWorker } from "./src/worker";
import { runScheduledWindow } from "./src/scheduled-window";
import { createHealthApp, healthPort } from "./src/server";

// Validate configuration before starting background work.
void tba;
const mode = process.env.WORKER_MODE ?? "continuous";
if (!["batch", "continuous", "scheduled"].includes(mode))
  throw new Error("WORKER_MODE must be batch, scheduled or continuous");
const effectsEnabled = process.env.API_EFFECTS_ENABLED === "true";
if (effectsEnabled && mode !== "continuous")
  throw new Error(
    "API_EFFECTS_ENABLED requires WORKER_MODE=continuous; finite import windows cannot provide continuous effect delivery",
  );

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
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
let server: ReturnType<typeof Bun.serve> | undefined;
let effects: ReturnType<typeof createOutboxDelivery> | undefined;
let effectsLoop: Promise<void> | undefined;
try {
  if (mode === "batch") {
    await runBatch(db, shutdown.signal, concurrency);
  } else if (mode === "scheduled") {
    await runScheduledWindow(db, shutdown.signal, concurrency);
  } else {
    await db.$queryRaw`SELECT 1 FROM "ImportJob", "FetchState", "TournamentGap" LIMIT 0`;
    server = Bun.serve({ hostname: "0.0.0.0", port, fetch: app.fetch });
    if (effectsEnabled) {
      effects = createOutboxDelivery(db, {
        redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
        prefix: process.env.REDIS_KEY_PREFIX ?? "lovat:rewrite:",
        resendKey: process.env.RESEND_KEY,
        emailFrom: process.env.EMAIL_FROM,
        slackWebhook: process.env.SLACK_WEBHOOK,
      });
      effectsLoop = runOutbox(db, effects, shutdown.signal);
    }
    await runWorker(db, shutdown.signal, concurrency, () => {
      lastReconciledAt = Date.now();
    });
  }
} finally {
  shutdown.abort();
  await effectsLoop;
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  effects?.close();
  await server?.stop(true);
  await db.$disconnect();
}
