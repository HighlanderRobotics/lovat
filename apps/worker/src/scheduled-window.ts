import type { PrismaClient } from "@lovat/db";
import { day, tournamentCadence } from "./schedule";
import { runBatch, runWorker } from "./worker";

export async function hasCompetitionDates(db: PrismaClient, now = new Date()) {
  // The date columns are UTC midnights, while phase boundaries are event-local.
  const events = await db.tournament.findMany({
    where: {
      startDate: { lte: new Date(now.getTime() + day) },
      endDate: { gte: new Date(now.getTime() - 2 * day) },
    },
    select: { startDate: true, endDate: true, timezone: true },
  });
  return events.some(
    (event) => tournamentCadence(event, now).phase === "active",
  );
}

/** Six-hour Cron starts before local 07:00; active dates keep the run alive. */
export async function runScheduledWindow(
  db: PrismaClient,
  signal: AbortSignal,
  concurrency = 2,
  dependencies = { hasCompetitionDates, runBatch, runWorker },
) {
  try {
    if (signal.aborted) return;
    if (!(await dependencies.hasCompetitionDates(db))) {
      const discovered = new AbortController();
      await dependencies.runBatch(
        db,
        AbortSignal.any([signal, discovered.signal]),
        concurrency,
        undefined,
        async () => {
          if (await dependencies.hasCompetitionDates(db)) discovered.abort();
        },
      );
      // Catalog imports can discover an event which is already in progress.
      if (signal.aborted || !(await dependencies.hasCompetitionDates(db)))
        return;
    }

    console.info(JSON.stringify({ event: "window.continuous" }));
    const finished = new AbortController();
    await dependencies.runWorker(
      db,
      AbortSignal.any([signal, finished.signal]),
      concurrency,
      async () => {
        if (!(await dependencies.hasCompetitionDates(db))) finished.abort();
      },
    );
    console.info(JSON.stringify({ event: "window.drained" }));
  } finally {
    await db.$disconnect();
  }
}
