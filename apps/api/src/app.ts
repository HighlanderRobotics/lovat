import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import {
  routes,
  type AnalysisRequest,
  type AnalysisResponse,
} from "@lovat/api";
import { games, type GameCatalog } from "@lovat/games";
import type { AccessScope, Authenticate } from "./auth.js";
import type { AnalysisRepository } from "./repository.js";
import { HttpError, publicError } from "./errors.js";
import { dispatch, type ServiceDependencies } from "./http/dispatch.js";
import { readServicePayload } from "./http/payload.js";
import { Reply } from "./http/router.js";

export interface Dependencies {
  gameCatalog?: GameCatalog;
  analyze?: (
    scope: AccessScope,
    request: AnalysisRequest,
  ) => Promise<AnalysisResponse>;
  services?: ServiceDependencies;
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
export type ApiEnvironment = {
  Bindings: { remoteAddress?: string };
  Variables: { requestId: string };
};
export function createApi(deps: Dependencies) {
  const catalog = deps.gameCatalog ?? games;
  const app = new Hono<ApiEnvironment>({ strict: false });
  let draining = false;
  let active = 0;
  app.onError((error, c) => {
    const failure = publicError(error);
    return c.json(
      {
        code: failure.code,
        message: failure.message,
        displayError: failure.message,
      },
      failure.status as 400,
    );
  });
  app.use("*", async (c, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    c.set("requestId", requestId);
    c.header("X-Request-ID", requestId);
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    let admitted = false;
    try {
      const origin = c.req.header("origin");
      if (origin) {
        if (!deps.origins?.includes(origin))
          throw new HttpError(
            403,
            "ORIGIN_NOT_ALLOWED",
            "Origin is not allowed",
          );
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Vary", "Origin");
      }
      if (c.req.method === "OPTIONS") {
        c.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE",
        );
        c.header(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type, X-Team-Code, X-Scouter-Uuid, X-Device-Id, X-Timestamp, X-Signature",
        );
        return c.body(null, 204);
      }
      if (c.req.method === "GET" && c.req.path === "/health/live")
        return c.json({ status: "ok" });
      if (draining || active >= (deps.maxConcurrent ?? 4))
        throw new HttpError(503, "UNAVAILABLE", "Service is busy or draining");
      active++;
      admitted = true;
      await next();
    } catch (error) {
      const failure = publicError(error);
      return c.json(
        {
          code: failure.code,
          message: failure.message,
          displayError: failure.message,
        },
        failure.status as 400,
      );
    } finally {
      if (admitted) active--;
      try {
        deps.log?.({
          requestId,
          route: c.req.routePath ?? "unmatched",
          status: c.res.status,
          durationMs: performance.now() - started,
        });
      } catch {
        /* Optional telemetry must not break a request. */
      }
    }
  });
  app.get("/health/ready", async (c) => {
    const ready = await deps.ready();
    return c.json({ status: ready ? "ok" : "unavailable" }, ready ? 200 : 503);
  });
  // Hono compiles the route table once; domain modules only declare endpoints.
  if (deps.services) {
    const services = deps.services;
    for (const endpoint of services.router.endpoints) {
      app.on(endpoint.method, endpoint.path, async (c) => {
        let params: Record<string, string>;
        try {
          for (const segment of c.req.path.split("/"))
            decodeURIComponent(segment);
          params = c.req.param();
        } catch {
          throw new HttpError(400, "INVALID_PATH", "Invalid URL encoding");
        }
        const payload = await readServicePayload(c.req.raw);
        const url = new URL(c.req.url);
        const value = await dispatch(
          services,
          { endpoint, params },
          {
            ...payload,
            headers: Object.fromEntries(c.req.raw.headers),
            query: Object.fromEntries(url.searchParams),
            method: c.req.method,
            path: url.pathname + url.search,
            remoteAddress: c.env?.remoteAddress,
          },
        );
        const reply = value instanceof Reply ? value : new Reply(value);
        const isText = typeof reply.body === "string";
        return new Response(
          isText ? (reply.body as string) : JSON.stringify(reply.body),
          {
            status: reply.status,
            headers: {
              "Content-Type": isText
                ? "text/plain; charset=utf-8"
                : "application/json; charset=utf-8",
              ...reply.headers,
            },
          },
        );
      });
    }
  }
  app.get(routes.games.path, (c) =>
    c.json(routes.games.output.parse(catalog.list())),
  );
  app.get(routes.metrics.path, async (c) => {
    await deps.authenticate(c.req.header("authorization"));
    const selection = routes.metrics.input.safeParse(c.req.query());
    if (!selection.success)
      throw new HttpError(400, "INVALID_REQUEST", "Invalid game selection");
    const game = catalog.get(
      selection.data.season ?? 2026,
      selection.data.gameVersion,
    );
    return c.json(routes.metrics.output.parse(game.metrics.metadata()));
  });
  app.post(routes.analyze.path, async (c) => {
    const scope = await deps.authenticate(c.req.header("authorization"));
    const { body } = await readServicePayload(c.req.raw, 64 * 1024, true);
    const parsed = routes.analyze.input.safeParse(body);
    if (!parsed.success)
      throw new HttpError(400, "INVALID_REQUEST", "Invalid request parameters");
    const input = parsed.data;
    const game = catalog.get(input.season, input.gameVersion);
    let definitions;
    try {
      definitions = game.metrics.resolve(input.metrics);
    } catch {
      throw new HttpError(
        400,
        "UNKNOWN_METRIC",
        "One or more metrics are unknown",
      );
    }
    const requires = new Set(
      definitions.flatMap((definition) => definition.metadata.requires),
    );
    const reports = deps.analyze
      ? []
      : await deps.repository.loadReports(scope, input, requires);
    const output = deps.analyze
      ? await deps.analyze(scope, input)
      : game.analyze(reports, input);
    for (const team of Object.values(output.teams)) {
      for (const result of [
        team.metrics,
        ...(team.timeline?.map((match) => match.metrics) ?? []),
      ]) {
        for (const [id, metric] of Object.entries(result)) {
          const precision = game.metrics.get(id).metadata.precision;
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
    return c.json(routes.analyze.output.parse(output));
  });
  for (const route of [routes.submitGameReport, routes.predictGame]) {
    app.post(route.path, () => {
      throw new HttpError(
        503,
        "REPORT_SERVICE_UNAVAILABLE",
        "Report storage is unavailable",
      );
    });
  }
  app.notFound(() => {
    throw new HttpError(404, "NOT_FOUND", "Route not found");
  });
  return {
    app,
    drain: () => {
      draining = true;
    },
  };
}
