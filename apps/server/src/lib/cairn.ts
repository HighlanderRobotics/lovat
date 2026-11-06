import type { RequestHandler } from "express";
import { createTelemetry, type TelemetryOptions } from "@cairn/telemetry";

const methods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
const prefixes = new Set([
  "",
  "/v1",
  "/v1/analysis",
  "/v1/slack",
  "/v1/doc",
  "/collection",
  "/v2/collection",
  "/v1/manager",
  ...[
    "onboarding",
    "picklists",
    "mutablepicklists",
    "registeredteams",
    "scoutershifts",
    "tournament",
    "scoutreports",
    "settings",
    "apikey",
  ].map((path) => `/v1/manager/${path}`),
]);

export type CairnReporter = {
  enabled: boolean;
  middleware: RequestHandler;
  flush: () => Promise<void>;
  shutdown: (timeoutMs?: number) => Promise<void>;
};

export function createCairnReporter(
  env: NodeJS.ProcessEnv = process.env,
  fetcher?: TelemetryOptions["fetch"],
): CairnReporter {
  let exporter: ReturnType<typeof createTelemetry> | undefined;

  if (env.CAIRN_ENABLED === "true") {
    try {
      const endpoint = new URL(env.CAIRN_URL ?? "");
      const environment =
        env.CAIRN_ENVIRONMENT ?? env.NODE_ENV ?? "development";
      const local =
        env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);

      if (
        (endpoint.protocol !== "https:" &&
          !(local && endpoint.protocol === "http:")) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        endpoint.pathname !== "/" ||
        !env.CAIRN_INGESTION_TOKEN?.trim() ||
        !/^[a-zA-Z0-9_.:-]{1,120}$/.test(environment)
      ) {
        throw new Error("Invalid Cairn configuration");
      }

      exporter = createTelemetry({
        endpoint: endpoint.origin,
        token: env.CAIRN_INGESTION_TOKEN,
        service: "lovat-api",
        environment,
        deploymentId: env.RAILWAY_DEPLOYMENT_ID,
        appVersion: env.npm_package_version,
        fetch: fetcher,
      });
    } catch {
      console.warn(
        "Cairn telemetry disabled: check CAIRN_URL, environment, and ingestion credential.",
      );
    }
  }

  const middleware: RequestHandler = (req, res, next) => {
    if (!exporter || !methods.has(req.method)) {
      next();
      return;
    }

    const id = crypto.randomUUID();
    const receivedAt = new Date().toISOString();
    const started = performance.now();
    res.setHeader("x-cairn-request-id", id);

    res.once("finish", () => {
      const template: unknown = req.route?.path;
      const route =
        typeof template === "string" &&
        template.startsWith("/") &&
        !/[?#]/.test(template) &&
        prefixes.has(req.baseUrl) &&
        req.baseUrl.length + template.length <= 500
          ? `${req.baseUrl}${template}`
          : "/__unmatched__";

      exporter.record({
        id,
        requestId: id,
        receivedAt,
        completedAt: new Date().toISOString(),
        durationMs: performance.now() - started,
        service: "lovat-api",
        environment: env.CAIRN_ENVIRONMENT ?? env.NODE_ENV ?? "development",
        deploymentId: env.RAILWAY_DEPLOYMENT_ID,
        appVersion: env.npm_package_version,
        method: req.method as
          "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS",
        route,
        statusCode: res.statusCode,
      });
    });

    next();
  };

  return {
    enabled: Boolean(exporter),
    middleware,
    flush: () => exporter?.flush() ?? Promise.resolve(),
    shutdown: (timeoutMs = 1000) =>
      exporter?.shutdown({ timeoutMs }) ?? Promise.resolve(),
  };
}

export const cairn = createCairnReporter();
