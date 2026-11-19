import type { PrismaClient } from "@lovat/db";
import { reconcileSchedule, runNextJob } from "./scheduler";

function sleep(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };

    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function runWorker(
  db: PrismaClient,
  signal: AbortSignal,
  concurrency = 2,
  onReconciled: () => void | Promise<void> = () => {},
) {
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 16
  ) {
    throw new Error("Worker concurrency must be an integer between 1 and 16");
  }

  const planner = async () => {
    while (!signal.aborted) {
      try {
        await reconcileSchedule(db);
        await onReconciled();
      } catch {
        console.error("Schedule reconciliation failed; retrying in 30 seconds");
      }

      await sleep(30_000, signal);
    }
  };

  const consumer = async () => {
    while (!signal.aborted) {
      try {
        if (await runNextJob(db)) continue;
      } catch {
        console.error("Job claim or completion failed; retrying in 5 seconds");
      }

      await sleep(5_000, signal);
    }
  };

  await Promise.all([
    planner(),
    ...Array.from({ length: concurrency }, consumer),
  ]);
}

/** A fixed snapshot prevents short recurrences, retries and child jobs from looping. */
export async function runBatch(
  db: PrismaClient,
  signal: AbortSignal,
  concurrency = 2,
  dependencies = { reconcileSchedule, runNextJob },
) {
  const startedAt = Date.now();
  try {
    if (
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 16
    ) {
      throw new Error("Worker concurrency must be an integer between 1 and 16");
    }
    if (signal.aborted) return;
    await dependencies.reconcileSchedule(db);
    const cutoff = new Date();
    const jobs = await db.importJob.findMany({
      where: {
        runAt: { lte: cutoff },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: cutoff } }],
      },
      select: { id: true },
      orderBy: [{ runAt: "asc" }, { id: "asc" }],
    });
    let cursor = 0;
    let processed = 0;
    // Wait for every consumer before disconnecting, including on claim errors.
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, async () => {
        while (!signal.aborted) {
          const job = jobs[cursor++];
          if (!job) return;
          if (
            await dependencies.runNextJob(db, undefined, { cutoff, id: job.id })
          )
            processed++;
        }
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    console.info(
      JSON.stringify({
        event: "batch.completed",
        eligible: jobs.length,
        processed,
        interrupted: signal.aborted,
        durationMs: Date.now() - startedAt,
      }),
    );
  } finally {
    await db.$disconnect();
    console.info(
      JSON.stringify({
        event: "batch.disconnected",
        at: new Date().toISOString(),
      }),
    );
  }
}
