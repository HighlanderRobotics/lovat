import { runBackgroundTask } from "./errors.js";

interface ShutdownWork {
  track(task: () => Promise<unknown>, context: string): Promise<void>;
  drain(): Promise<void>;
}

/** Track shared-client work that deliberately outlives its HTTP response. */
export function createShutdownWork(): ShutdownWork {
  const pending = new Set<Promise<void>>();

  return {
    track(task: () => Promise<unknown>, context: string): Promise<void> {
      const work = runBackgroundTask(task, context).finally(() => {
        pending.delete(work);
      });
      pending.add(work);
      return work;
    },
    async drain(): Promise<void> {
      while (pending.size > 0) {
        await Promise.all(pending);
      }
    },
  };
}

export const shutdownWork = createShutdownWork();
