import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { posthog } from "../../posthogClient.js";
import { ENVIRONMENT } from "../environment.js";
import type { AuthenticatedRequest } from "./requireAuth.js";

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

const operatingSystems = new Set([
  "android",
  "ios",
  "web",
  "macos",
  "windows",
  "linux",
  "fuchsia",
]);

// These are untrusted app hints. Only report narrow release formats and
// supported platform labels; never record arbitrary client header strings.
const appVersionPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const appBuildPattern = /^\d{1,5}(?:\.\d{1,5}){0,2}$/;

function readReleaseHeader(
  value: string | string[] | undefined,
  pattern: RegExp,
): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function readOperatingSystem(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && operatingSystems.has(value)
    ? value
    : undefined;
}

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
      // Only requireAuth sets both fields, after validating a JWT or API key.
      // Collection team membership checks do not authenticate an individual.
      const { user, tokenType } = req as Partial<AuthenticatedRequest>;
      const caller =
        user?.id && (tokenType === "jwt" || tokenType === "apiKey")
          ? user
          : undefined;
      const os =
        readOperatingSystem(req.headers["x-operating-system"]) ??
        readOperatingSystem(req.headers["x-os-name"]);

      posthog.capture({
        distinctId: caller?.id ?? "lovat-server",
        event: "response",
        timestamp: new Date(),
        disableGeoip: true,
        properties: {
          $process_person_profile: caller !== undefined,
          service: "server",
          environment: ENVIRONMENT,
          requestId,
          railwayDeployment: process.env.RAILWAY_DEPLOYMENT_ID,
          railwayReplica: process.env.RAILWAY_REPLICA_ID,
          gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA,
          method: methods.has(req.method) ? req.method : "OTHER",
          route,
          $pathname: route === "unmatched" ? undefined : route,
          userType: caller ? "user" : undefined,
          authType: caller ? tokenType : undefined,
          teamNumber: caller?.teamNumber ?? undefined,
          role: caller?.role,
          $set: caller
            ? {
                userType: "user",
                teamNumber: caller.teamNumber,
                role: caller.role,
              }
            : undefined,
          appVersion: readReleaseHeader(
            req.headers["x-app-version"],
            appVersionPattern,
          ),
          appBuild: readReleaseHeader(
            req.headers["x-build-number"],
            appBuildPattern,
          ),
          $os_name: os,
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
