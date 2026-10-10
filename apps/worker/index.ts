import { db } from "./src/db";
import { tba } from "./src/tba";
import { runWorker } from "./src/worker";

// Validate the provider configuration before starting any background work.
void tba;

const shutdown = new AbortController();
const stop = () => shutdown.abort();

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await runWorker(
    db,
    shutdown.signal,
    Number(process.env.WORKER_CONCURRENCY ?? 2),
  );
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  await db.$disconnect();
}
