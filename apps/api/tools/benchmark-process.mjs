import { fileURLToPath } from "node:url";

/** The measured process never creates fixtures or executes the HTTP client. */
export async function startBenchmarkServer(config) {
  const pending = new Map();
  let sequence = 0;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const child = Bun.spawn(
    [
      process.execPath,
      "--smol",
      fileURLToPath(new URL("./benchmark-server.mjs", import.meta.url)),
    ],
    {
      env: { ...process.env, BENCHMARK_CONFIG: JSON.stringify(config) },
      stdout: "ignore",
      stderr: "inherit",
      ipc(message) {
        if (message.type === "ready") resolveReady(message);
        if (message.type === "stats") {
          pending.get(message.id)?.resolve(message);
          pending.delete(message.id);
        }
      },
    },
  );
  child.exited.then((code) => {
    const error = Error("Benchmark server exited: " + code);
    rejectReady(error);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
  const timeout = setTimeout(() => {
    child.kill();
    rejectReady(Error("Benchmark startup timed out"));
  }, 15000);
  let initial;
  try {
    initial = await ready;
  } finally {
    clearTimeout(timeout);
  }
  return {
    url: initial.url,
    initial,
    stats() {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("Benchmark stats timed out"));
        }, 10000);
        pending.set(id, {
          resolve: (message) => {
            clearTimeout(timer);
            resolve(message);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        child.send({ type: "stats", id });
      });
    },
    async stop() {
      if (child.exitCode !== null) return;
      child.send({ type: "stop" });
      const deadline = setTimeout(() => child.kill(), 15000);
      try {
        if ((await child.exited) !== 0)
          throw Error("Benchmark server failed during shutdown");
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}
