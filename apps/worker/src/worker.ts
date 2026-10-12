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
  onReconciled: () => void = () => {},
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
        onReconciled();
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
