interface HealthState {
  start(): void;
  stop(): void;
  drain(): Promise<void>;
  isStopping(): boolean;
  ready(): Promise<boolean>;
}

/** Coalesce probes and bound response time, even when a driver never settles. */
export function createHealth(
  checks: (() => Promise<unknown>)[],
  { timeoutMs = 1000, cacheMs = 1000 } = {},
): HealthState {
  let serving = false;
  let stopping = false;
  let cached: { ready: boolean; expires: number } | undefined;
  let checking: Promise<boolean> | undefined;
  const active = new Set<Promise<boolean>>();
  const probes = checks.map((check) => {
    let running: Promise<boolean> | undefined;
    return () => {
      // A timed-out driver call stays in flight: do not pile up connections.
      if (!running) {
        const pending = Promise.resolve()
          .then(check)
          .then(
            () => true,
            () => false,
          )
          .finally(() => {
            active.delete(pending);
            running = undefined;
          });
        active.add(pending);
        running = pending;
      }
      return running;
    };
  });

  return {
    start(): void {
      serving = true;
      stopping = false;
      cached = undefined;
    },
    stop(): void {
      serving = false;
      stopping = true;
      cached = undefined;
    },
    async drain(): Promise<void> {
      await Promise.all(active);
    },
    isStopping(): boolean {
      return stopping;
    },
    async ready(): Promise<boolean> {
      if (!serving) {
        return false;
      }
      if (cached && cached.expires > Date.now()) {
        return cached.ready;
      }
      if (!checking) {
        checking = new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), timeoutMs);
          void Promise.all(probes.map((probe) => probe())).then((results) => {
            clearTimeout(timer);
            resolve(results.every(Boolean));
          });
        }).then((ready) => {
          cached = { ready, expires: Date.now() + cacheMs };
          checking = undefined;
          return ready;
        });
      }
      const ready = await checking;
      return serving && ready;
    },
  };
}
