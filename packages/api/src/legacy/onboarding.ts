import { LovatTimestampHeader } from "./models.js";
import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export function registerOnboardingPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/v1/manager/onboarding/verifyemail",
    tags: ["Manager - Onboarding"],
    summary: "Approve team email (signed)",
    request: {
      headers: LovatTimestampHeader,
      body: {
        content: {
          "application/json": { schema: z.object({ code: z.string() }) },
        },
      },
    },
    responses: {
      200: { description: "Approved" },
      400: { description: "Invalid" },
      403: { description: "Invalid signature" },
      404: { description: "Code not recognized" },
      500: { description: "Server error" },
    },
    security: [{ lovatSignature: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/onboarding/username",
    tags: ["Manager - Onboarding"],
    summary: "Set username",
    request: {
      body: {
        content: {
          "application/json": { schema: z.object({ username: z.string() }) },
        },
      },
    },
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid" },
      401: { description: "Unauthorized" },
      403: { description: "Cannot be performed using an API key" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/onboarding/teamcode",
    tags: ["Manager - Onboarding"],
    summary: "Check team code",
    request: { query: z.object({ team: z.string(), code: z.string() }) },
    responses: {
      200: { description: "Valid" },
      400: { description: "Invalid" },
      401: { description: "Unauthorized" },
      403: { description: "Cannot be performed using an API key" },
      404: { description: "Team/code not found" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/onboarding/team",
    tags: ["Manager - Onboarding"],
    summary: "Add registered team",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              number: z.number().int(),
              name: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Added" },
      400: { description: "Invalid" },
      401: { description: "Unauthorized" },
      403: { description: "Cannot be performed using an API key" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/onboarding/teamwebsite",
    tags: ["Manager - Onboarding"],
    summary: "Add team website",
    request: {
      body: {
        content: {
          "application/json": { schema: z.object({ website: z.string() }) },
        },
      },
    },
    responses: {
      200: { description: "Added" },
      400: { description: "Invalid" },
      401: { description: "Unauthorized" },
      403: { description: "Cannot be performed using an API key" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/onboarding/resendverificationemail",
    tags: ["Manager - Onboarding"],
    summary: "Resend verification email",
    responses: {
      200: { description: "Sent" },
      401: { description: "Unauthorized" },
      403: { description: "Cannot be performed using an API key" },
      404: { description: "Team not found" },
      429: { description: "Rate limited" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
}
