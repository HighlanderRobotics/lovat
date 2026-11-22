import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { apiErrorSchema } from "../errors.js";

// Enable .openapi() on Zod types
extendZodWithOpenApi(z);

import { registerPrismaSchemas } from "./models.js";
import { registerAnalysisPaths } from "./analysis.js";
import { registerCsvPaths } from "./csv.js";
import { registerScoutreportPaths } from "./scoutreport.js";
import { registerTeamLookupPaths } from "./teamLookup.js";
import { registerApikeyPaths } from "./apikey.js";
import { registerManagerPaths } from "./manager.js";
import { registerMutablepicklistsPaths } from "./mutablepicklists.js";
import { registerOnboardingPaths } from "./onboarding.js";
import { registerPicklistsPaths } from "./picklists.js";
import { registerRegisteredteamsPaths } from "./registeredteams.js";
import { registerScoutersPaths } from "./scouters.js";
import { registerScoutershiftsPaths } from "./scoutershifts.js";
import { registerScoutreportsPaths } from "./scoutreports.js";
import { registerSettingsPaths } from "./settings.js";
import { registerTournamentsPaths } from "./tournaments.js";
import { registerSlackPaths } from "./slack.js";

export function createLegacyOpenApiDocument(options: {
  version: string;
  baseUrl: string;
}) {
  const registry = new OpenAPIRegistry();

  registry.register("ApiError", z.object(apiErrorSchema.shape));

  const apiErrorContent = {
    "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
  };

  registry.registerComponent("responses", "ApiErrorResponse", {
    description:
      "Request failed. The HTTP status describes the failure category; code identifies the error. Unexpected server failures use INTERNAL_SERVER_ERROR and a generic message.",
    content: apiErrorContent,
  });

  // Import and register Prisma-derived schemas
  registerPrismaSchemas(registry);

  // Register security schemes
  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description:
      "Accepts either a JWT token from Auth0 or an API key (prefixed with 'lvt-'). " +
      "Use format: Authorization: Bearer <token>",
  });
  registry.registerComponent("securitySchemes", "slackToken", {
    type: "apiKey",
    in: "header",
    name: "x-slack-signature",
    description:
      "Slack signature header (requires accompanying x-slack-request-timestamp)",
  });
  registry.registerComponent("securitySchemes", "lovatSignature", {
    type: "apiKey",
    in: "header",
    name: "x-signature",
    description: "HMAC signature header (requires accompanying x-timestamp)",
  });

  // Minimal example: document the /status health check route
  registry.registerPath({
    method: "get",
    path: "/status",
    summary: "Health check",
    description: "Returns a simple message indicating the server is running.",
    responses: {
      200: {
        description: "Server is running",
        content: {
          "text/plain": {
            schema: z.string().openapi({ example: "Server running" }),
          },
        },
      },
    },
  });

  registerAnalysisPaths(registry);
  registerCsvPaths(registry);
  registerScoutreportPaths(registry);
  registerTeamLookupPaths(registry);
  registerApikeyPaths(registry);
  registerManagerPaths(registry);
  registerMutablepicklistsPaths(registry);
  registerOnboardingPaths(registry);
  registerPicklistsPaths(registry);
  registerRegisteredteamsPaths(registry);
  registerScoutersPaths(registry);
  registerScoutershiftsPaths(registry);
  registerScoutreportsPaths(registry);
  registerSettingsPaths(registry);
  registerTournamentsPaths(registry);
  registerSlackPaths(registry);

  const generator = new OpenApiGeneratorV31(registry.definitions);
  const document = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Lovat API",
      version: options.version,
      description:
        "API Documentation for Lovat, a scouting system used to scout teams and matches in the First Robotics Competition. Clients request the shared format using X-Lovat-Error-Format: json-v1. Without that header, direct guard responses retain their legacy formats for installed clients; unexpected failures are still sanitized. Negotiated HTTP error responses (400–599) use application/json and the ApiError schema. message and displayError contain the same safe text. invalidFields and retryAfterSeconds appear only when applicable. Authentication, validation, missing resources, rate limits and unexpected failures share this format. Success responses, including legacy domain messages returned with status 200, retain their documented shapes. Internal exception details and submitted values are not part of the error response.",
    },
    servers: [{ url: options.baseUrl }],
  });

  return normalizeLegacyErrorResponses(document);
}

export function normalizeLegacyErrorResponses(
  document: ReturnType<OpenApiGeneratorV31["generateDocument"]>,
) {
  const apiErrorContent = {
    "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
  };
  // Keep each endpoint's status descriptions and headers while documenting the
  // response contract enforced by errorResponses and errorHandler.
  for (const path of Object.values(document.paths ?? {})) {
    if (!path) {
      continue;
    }
    for (const method of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "options",
      "head",
      "trace",
    ] as const) {
      const operation = path[method];
      if (!operation) {
        continue;
      }
      operation.responses ??= {};
      for (const [status, response] of Object.entries(operation.responses)) {
        if (
          /^[45](?:\d{2}|XX)$/.test(status) &&
          response &&
          !("$ref" in response)
        ) {
          response.content = apiErrorContent;
        }
      }
      operation.responses.default ??= {
        $ref: "#/components/responses/ApiErrorResponse",
      };
    }
  }
  return document;
}
