import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import pkg from "./../../package.json" with { type: "json" };

// Enable .openapi() on Zod types
extendZodWithOpenApi(z);

// Shared OpenAPI registry for the app. Other modules can import and register.
export const registry = new OpenAPIRegistry();

export const ApiErrorSchema = registry.register(
  "ApiError",
  z.object({
    code: z.string().openapi({
      description:
        "Machine-readable error identifier. Use the HTTP status and code for program decisions; messages may change.",
      example: "INVALID_QUERY_PARAMETERS",
    }),
    message: z.string().openapi({
      description: "Safe, human-readable explanation.",
      example: "Invalid team query parameters",
    }),
    displayError: z.string().openapi({
      description:
        "Compatibility alias of message, with the same value, for existing clients.",
      example: "Invalid team query parameters",
    }),
    invalidFields: z.array(z.string()).optional().openapi({
      description:
        "Optional field names to correct. Submitted values are never included.",
    }),
    retryAfterSeconds: z.number().optional().openapi({
      description:
        "Optional retry delay in seconds. Also respect Retry-After when provided.",
    }),
  }),
);

const apiErrorContent = {
  "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
};

registry.registerComponent("responses", "ApiErrorResponse", {
  description:
    "Request failed. The HTTP status describes the failure category; code identifies the error. Unexpected server failures use INTERNAL_SERVER_ERROR and a generic message.",
  content: apiErrorContent,
});

// Import and register Prisma-derived schemas
import { registerPrismaSchemas } from "./prisma-zod.js";
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

// Reusable header parameter schema for x-timestamp (used with lovatSignature)
export const LovatTimestampHeader = z.object({
  "x-timestamp": z.string().openapi({
    description: "Unix timestamp (seconds) used in HMAC signature generation",
  }),
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

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const document = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Lovat API",
      version: pkg.version,
      description:
        "API Documentation for Lovat, a scouting system used to scout teams and matches in the First Robotics Competition. HTTP error responses (400–599) use application/json and the ApiError schema. message and displayError contain the same safe text. invalidFields and retryAfterSeconds appear only when applicable. Authentication, validation, missing resources, rate limits and unexpected failures share this format. Success responses, including legacy domain messages returned with status 200, retain their documented shapes. Internal exception details and submitted values are not part of the error response.",
    },
    servers: [{ url: `${process.env.BASE_URL || "https://api.lovat.app"}` }],
  });

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
