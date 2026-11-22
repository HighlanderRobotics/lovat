import { HttpError } from "./errors.js";
/** Serialize expensive cold analyses; cached responses never enter this queue. */
export function createAnalysisBudget(
  maxConcurrent = 1,
  maxQueued = 4,
  waitMs = 5000,
) {
  let active = 0;
  const queue: (() => void)[] = [];
  const release = () => {
    active--;
    queue.shift()?.();
  };
  const acquire = (): Promise<() => void> => {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve(release);
    }
    if (queue.length >= maxQueued)
      return Promise.reject(
        new HttpError(503, "ANALYSIS_BUSY", "Analysis is busy; retry shortly"),
      );
    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer);
        active++;
        resolve(release);
      };
      const timer = setTimeout(() => {
        const index = queue.indexOf(grant);
        if (index >= 0) queue.splice(index, 1);
        reject(
          new HttpError(
            503,
            "ANALYSIS_BUSY",
            "Analysis is busy; retry shortly",
          ),
        );
      }, waitMs);
      queue.push(grant);
    });
  };
  return async <T>(work: () => Promise<T>) => {
    const done = await acquire();
    try {
      return await work();
    } finally {
      done();
    }
  };
}

export const analysisBudget = createAnalysisBudget();
