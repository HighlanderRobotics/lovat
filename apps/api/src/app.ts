import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { routes } from "@lovat/api";
import type { Authenticate } from "./auth.js";
import type { AnalysisRepository } from "./repository.js";
import { HttpError } from "./errors.js";
import { analyzeReports } from "./metrics/engine.js";
import { season2026 } from "./metrics/season2026.js";

interface Dependencies {
  authenticate: Authenticate;
  repository: AnalysisRepository;
  ready: () => Promise<boolean>;
  origins?: readonly string[];
  maxConcurrent?: number;
  log?: (event: {
    requestId: string;
    route: string;
    status: number;
    durationMs: number;
  }) => void;
}
const MAX_BODY = 64 * 1024;
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (
    req.headers["content-type"]?.split(";")[0].trim() !== "application/json"
  ) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json");
  }
  if (
    req.headers["content-encoding"] &&
    req.headers["content-encoding"] !== "identity"
  ) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Compressed request bodies are unsupported",
    );
  }
  if (Number(req.headers["content-length"]) > MAX_BODY) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body is too large");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY) {
      throw new HttpError(
        413,
        "REQUEST_TOO_LARGE",
        "Request body is too large",
      );
    }
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Invalid JSON body");
  }
}
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
export function createApi(deps: Dependencies) {
  let draining = false;
  let active = 0;
  const server = createServer(
    {
      maxHeaderSize: 16 * 1024,
      requestTimeout: 10_000,
      headersTimeout: 10_000,
    },
    async (req, res) => {
      const requestId = randomUUID();
      const started = performance.now();
      let route = "unmatched";
      res.setHeader("X-Request-ID", requestId);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.once("finish", () => {
        try {
          deps.log?.({
            requestId,
            route,
            status: res.statusCode,
            durationMs: performance.now() - started,
          });
        } catch {
          /* Optional telemetry cannot break a completed request. */
        }
      });
      let admitted = false;
      try {
        const url = new URL(req.url ?? "/", "http://api.local");
        const origin = req.headers.origin;
        if (origin) {
          if (!deps.origins?.includes(origin)) {
            throw new HttpError(
              403,
              "ORIGIN_NOT_ALLOWED",
              "Origin is not allowed",
            );
          }
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Vary", "Origin");
        }
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET, POST");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type",
          );
          res.writeHead(204).end();
          return;
        }
        if (req.method === "GET" && url.pathname === "/health/live") {
          route = "/health/live";
          send(res, 200, { status: "ok" });
          return;
        }
        if (draining || active >= (deps.maxConcurrent ?? 4)) {
          throw new HttpError(
            503,
            "UNAVAILABLE",
            "Service is busy or draining",
          );
        }
        active++;
        admitted = true;
        if (req.method === "GET" && url.pathname === "/health/ready") {
          route = "/health/ready";
          const ready = await deps.ready();
          send(res, ready ? 200 : 503, {
            status: ready ? "ok" : "unavailable",
          });
          return;
        }
        const operation = Object.entries(routes).find(
          ([, definition]) =>
            definition.path === url.pathname &&
            definition.method === req.method,
        );
        if (!operation) {
          throw new HttpError(404, "NOT_FOUND", "Route not found");
        }
        route = operation[1].path;
        const scope = await deps.authenticate(req.headers.authorization);
        if (operation[0] === "metrics") {
          send(res, 200, routes.metrics.output.parse(season2026.metadata()));
          return;
        }
        const parsed = routes.analyze.input.safeParse(await readBody(req));
        if (!parsed.success) {
          throw new HttpError(
            400,
            "INVALID_REQUEST",
            "Invalid request parameters",
          );
        }
        const input = parsed.data;
        let definitions;
        try {
          definitions = season2026.resolve(input.metrics);
        } catch {
          throw new HttpError(
            400,
            "UNKNOWN_METRIC",
            "One or more metrics are unknown",
          );
        }
        if (input.season !== 2026) {
          throw new HttpError(
            400,
            "UNSUPPORTED_SEASON",
            "This API currently supports season 2026",
          );
        }
        const requires = new Set(
          definitions.flatMap((definition) => definition.metadata.requires),
        );
        const reports = await deps.repository.loadReports(
          scope,
          input,
          requires,
        );
        const output = analyzeReports(reports, input, season2026);
        // Precision stays intact inside the engine; serialize using each metric's precision.
        for (const team of Object.values(output.teams)) {
          const results = [
            team.metrics,
            ...(team.timeline?.map((match) => match.metrics) ?? []),
          ];
          for (const result of results) {
            for (const [id, metric] of Object.entries(result)) {
              const precision = season2026.get(id).metadata.precision;
              const round = (value: unknown): unknown =>
                typeof value === "number"
                  ? Number(value.toFixed(precision))
                  : Array.isArray(value)
                    ? value.map(round)
                    : value && typeof value === "object"
                      ? Object.fromEntries(
                          Object.entries(value).map(([key, child]) => [
                            key,
                            round(child),
                          ]),
                        )
                      : value;
              metric.value = round(metric.value) as typeof metric.value;
            }
          }
        }
        send(res, 200, routes.analyze.output.parse(output));
      } catch (error) {
        const failure =
          error instanceof HttpError
            ? error
            : new HttpError(
                500,
                "INTERNAL_SERVER_ERROR",
                "Internal server error",
              );
        if (!res.headersSent) {
          send(res, failure.status, {
            code: failure.code,
            message: failure.message,
            displayError: failure.message,
          });
        } else {
          res.destroy();
        }
      } finally {
        if (admitted) {
          active--;
        }
        // GET/early errors must not leave an unread body occupying a keep-alive socket.
        if (!req.complete) {
          req.resume();
        }
      }
    },
  );
  server.keepAliveTimeout = 5000;
  return {
    server,
    drain: () => {
      draining = true;
    },
  };
}
