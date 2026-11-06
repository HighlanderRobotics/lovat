export function exportLifecycle() {
  const controller = new AbortController();
  return {
    signal: (timeoutMs: number) =>
      AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
    get stopped() {
      return controller.signal.aborted;
    },
    stop: () => controller.abort(),
    async delay(ms: number) {
      if (controller.signal.aborted) return;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, ms);
        controller.signal.addEventListener("abort", finish, { once: true });
      });
    },
  };
}
export async function beforeDeadline(work: Promise<void>, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function shutdownDeadline(timeoutMs = 10000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
    throw new Error("Shutdown timeout must be a finite nonnegative number");
  return Date.now() + timeoutMs;
}
