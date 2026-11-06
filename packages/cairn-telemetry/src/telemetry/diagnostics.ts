import {
  configEvent,
  contactEvent,
  databaseEvent,
  flagEvent,
  jobEvent,
  qualityEvent,
  syncEvent,
} from "../operations/schemas.ts";

import {
  beforeDeadline,
  exportLifecycle,
  shutdownDeadline,
} from "./lifecycle.ts";

const schemas = {
  sync: syncEvent,
  jobs: jobEvent,
  quality: qualityEvent,
  installations: contactEvent,
  config: configEvent,
  flags: flagEvent,
  database: databaseEvent,
};
type Kind = keyof typeof schemas;
export function createDiagnostics(options: {
  endpoint: string;
  token: string;
  service: string;
  environment: string;
  maxQueue?: number;
  flushMs?: number;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}) {
  const queue: { kind: Kind; event: unknown }[] = [],
    health = { dropped: 0, failedExports: 0, exported: 0 };
  let flushing: Promise<void> | undefined,
    closed = false;
  const send = options.fetch ?? fetch;
  const lifecycle = exportLifecycle();
  function record(kind: Kind, input: Record<string, unknown>) {
    if (closed || queue.length >= (options.maxQueue ?? 1000)) {
      health.dropped++;
      return false;
    }
    const parsed = schemas[kind].safeParse({
      ...input,
      id: input.id ?? crypto.randomUUID(),
      service: options.service,
      environment: options.environment,
    });
    if (!parsed.success) {
      health.dropped++;
      return false;
    }
    queue.push({ kind, event: parsed.data });
    return true;
  }
  async function drain() {
    const next = queue[0];
    if (!next) return;
    const batch = queue.splice(0, 100),
      groups = new Map<Kind, unknown[]>();
    for (const item of batch) {
      const group = groups.get(item.kind) ?? [];
      group.push(item.event);
      groups.set(item.kind, group);
    }
    for (const [kind, events] of groups) {
      let ok = false;
      for (let retry = 0; retry < 3; retry++) {
        if (lifecycle.stopped) break;
        try {
          const response = await send(`${options.endpoint}/v1/ingest/${kind}`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(events),
            signal: lifecycle.signal(4000),
          });
          if (response.ok) {
            health.exported += events.length;
            ok = true;
            break;
          }
          health.failedExports++;
          if (response.status < 500 && response.status !== 429) break;
        } catch {
          health.failedExports++;
        }
        if (retry < 2)
          await lifecycle.delay(250 * 2 ** retry + Math.random() * 100);
      }
      if (!ok) health.dropped += events.length;
    }
  }
  function flush() {
    if (!flushing)
      flushing = drain().finally(() => {
        flushing = undefined;
      });
    return flushing;
  }
  const timer = setInterval(() => {
    void flush();
  }, options.flushMs ?? 2000);
  timer.unref?.();
  return {
    record,
    flush,
    health,
    queued: () => queue.length,
    async shutdown({ timeoutMs = 10000 }: { timeoutMs?: number } = {}) {
      const deadline = shutdownDeadline(timeoutMs);
      closed = true;
      clearInterval(timer);
      try {
        while ((queue.length || flushing) && Date.now() < deadline)
          await beforeDeadline(flush(), deadline);
      } finally {
        lifecycle.stop();
        health.dropped += queue.splice(0).length;
      }
    },
  };
}
