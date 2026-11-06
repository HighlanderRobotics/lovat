import type { MiddlewareHandler } from "hono";
import type { RequestEvent } from "../schemas/index.ts";
import {
  beforeDeadline,
  exportLifecycle,
  shutdownDeadline,
} from "./lifecycle.ts";
import { normalizeRoute, sanitizeMetadata } from "./redaction.ts";

export type TelemetryOptions = {
  endpoint: string;
  token: string;
  service: string;
  environment: string;
  deploymentId?: string;
  appVersion?: string;
  maxQueue?: number;
  batchSize?: number;
  flushMs?: number;
  maxRetries?: number;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
};
export function createTelemetry(options: TelemetryOptions) {
  const max = options.maxQueue ?? 2000,
    batch = Math.min(options.batchSize ?? 200, 500);
  if (max < batch || batch < 1)
    throw new Error("Queue must fit a positive batch");
  const queue: RequestEvent[] = [];
  let running: Promise<void> | undefined,
    closed = false;
  const health = { dropped: 0, failedExports: 0, exported: 0 };
  const send = options.fetch ?? fetch;
  const exporterId = crypto.randomUUID();
  const lifecycle = exportLifecycle();
  async function reportHealth() {
    try {
      await send(`${options.endpoint}/v1/ingest/health`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: exporterId,
          service: options.service,
          environment: options.environment,
          dropped: health.dropped,
          failedExports: health.failedExports,
        }),
        signal: lifecycle.signal(2000),
      });
    } catch {}
  }

  async function drain() {
    const items = queue.splice(0, batch);
    if (!items.length) return;
    let ok = false;
    for (let attempt = 0; attempt <= (options.maxRetries ?? 3); attempt++) {
      if (lifecycle.stopped) break;
      try {
        const response = await send(`${options.endpoint}/v1/ingest/requests`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(items),
          signal: lifecycle.signal(4000),
        });
        if (response.ok) {
          health.exported += items.length;
          ok = true;
          break;
        }
        if (response.status < 500 && response.status !== 429) break;
      } catch {}
      health.failedExports++;
      if (attempt < (options.maxRetries ?? 3))
        await lifecycle.delay(
          Math.min(250 * 2 ** attempt, 4000) + Math.random() * 200,
        );
    }
    if (!ok) health.dropped += items.length;
  }
  function flush() {
    if (!running)
      running = drain()
        .then(reportHealth)
        .finally(() => {
          running = undefined;
        });
    return running;
  }
  const timer = setInterval(() => {
    void flush();
  }, options.flushMs ?? 2000);
  timer.unref?.();
  function record(event: RequestEvent) {
    if (closed || queue.length >= max) {
      health.dropped++;
      return;
    }
    queue.push({ ...event, metadata: sanitizeMetadata(event.metadata) });
    if (queue.length >= batch) void flush();
  }
  const middleware: MiddlewareHandler = async (c, next) => {
    const start = performance.now(),
      receivedAt = new Date().toISOString(),
      id = crypto.randomUUID();
    c.header("x-request-id", id);
    try {
      await next();
    } finally {
      const route =
        c.req.routePath?.startsWith("/") && c.req.routePath !== "/*"
          ? c.req.routePath
          : c.res.status === 404
            ? "/__unmatched__"
            : normalizeRoute(c.req.path);
      record({
        id,
        requestId: id,
        traceId: /^[a-f0-9]{2}-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/i.test(
          c.req.header("traceparent") ?? "",
        )
          ? c.req.header("traceparent")?.split("-")[1]
          : undefined,
        receivedAt,
        completedAt: new Date().toISOString(),
        durationMs: performance.now() - start,
        service: options.service,
        environment: options.environment,
        deploymentId: options.deploymentId,
        appVersion: options.appVersion,
        method: c.req.method as RequestEvent["method"],
        route,
        statusCode: c.error ? 500 : c.res.status,
        responseBytes: Number(c.res.headers.get("content-length")) || undefined,
      });
    }
  };
  return {
    record,
    flush,
    middleware,
    health,
    queued: () => queue.length,
    async shutdown({ timeoutMs = 10000 }: { timeoutMs?: number } = {}) {
      const deadline = shutdownDeadline(timeoutMs);
      closed = true;
      clearInterval(timer);
      try {
        while ((queue.length || running) && Date.now() < deadline)
          await beforeDeadline(flush(), deadline);
      } finally {
        lifecycle.stop();
        health.dropped += queue.splice(0).length;
      }
    },
  };
}
