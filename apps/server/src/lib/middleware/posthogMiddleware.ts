import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { posthog } from "../../posthogClient.js";
import { ENVIRONMENT } from "../environment.js";

// Only literal mounts declared by app.ts and routes/*.routes.ts are safe.
// Express baseUrl contains actual values for parameterized mounts, so new or
// dynamic mounts fall back to an aggregate instead of exposing those values.
const telemetryMounts = new Set([
  "/v1",
  "/v1/slack",
  "/v1/manager",
  "/v1/analysis",
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
  ].map((mount) => `/v1/manager/${mount}`),
  "/collection",
  "/v2/collection",
]);
const methods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const posthogReporter = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const started = performance.now();
  // Never trust a caller-supplied request ID as telemetry.
  const requestId = randomUUID();

  res.once("finish", () => {
    const routePath: unknown = req.route?.path;
    // Express can clear baseUrl when an error unwinds a router. Count those
    // responses as unmatched unless the request matches a literal root route.
    const route =
      typeof routePath === "string" &&
      (telemetryMounts.has(req.baseUrl) ||
        (req.baseUrl === "" && req.path === routePath))
        ? `${req.baseUrl}${routePath}`
        : "unmatched";
    const cache = res.getHeader("X-Lovat-Cache");

    try {
      posthog.capture({
        distinctId: "lovat-server",
        event: "response",
        timestamp: new Date(),
        disableGeoip: true,
        properties: {
          $process_person_profile: false,
          service: "server",
          environment: ENVIRONMENT,
          requestId,
          railwayDeployment: process.env.RAILWAY_DEPLOYMENT_ID,
          method: methods.has(req.method) ? req.method : "OTHER",
          route,
          statusCode: res.statusCode,
          errorCode:
            res.statusCode >= 500
              ? "SERVER_ERROR"
              : res.statusCode >= 400
                ? "REQUEST_ERROR"
                : undefined,
          responseTime: Math.round(performance.now() - started),
          cache: cache === "hit" || cache === "miss" ? cache : "unknown",
        },
      });
    } catch {
      // Analytics must never affect the response or log an SDK error that may
      // contain a serialized payload or provider credentials.
      console.error("Request analytics failed");
    }
  });

  next();
};

export default posthogReporter;
