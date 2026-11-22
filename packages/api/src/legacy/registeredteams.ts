import { LovatTimestampHeader } from "./models.js";
import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { RegisteredTeamSchema } from "./models.js";

export function registerRegisteredteamsPaths(registry: OpenAPIRegistry) {
  const TeamParamSchema = z.object({ team: z.string() });
  const RegistrationStatusSchema = z.discriminatedUnion("status", [
    z.object({ status: z.literal("NOT_STARTED") }),
    z.object({
      status: z.literal("PENDING_EMAIL_VERIFICATION"),
      email: z.string(),
    }),
    z.object({ status: z.literal("PENDING_WEBSITE") }),
    z.object({
      status: z.literal("PENDING_TEAM_VERIFICATION"),
      teamEmail: z.string(),
    }),
    z.object({ status: z.literal("REGISTERED_ON_TEAM") }),
    z.object({ status: z.literal("REGISTERED_OFF_TEAM") }),
    z.object({ status: z.literal("PENDING") }),
  ]);
  registry.registerPath({
    method: "get",
    path: "/v1/manager/registeredteams/{team}/registrationstatus",
    tags: ["Manager - Registered Teams"],
    summary: "Check team registration status",
    request: { params: TeamParamSchema },
    responses: {
      200: {
        description: "Registration status",
        content: { "application/json": { schema: RegistrationStatusSchema } },
      },
      400: { description: "Invalid team" },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/registeredteams/{team}/approve",
    tags: ["Manager - Registered Teams"],
    summary: "Approve team",
    description:
      "Requires `x-signature` and `x-timestamp` headers. Signs request body, method, path.",
    request: { params: TeamParamSchema, headers: LovatTimestampHeader },
    responses: {
      200: {
        description: "Approved registered team row",
        content: { "application/json": { schema: RegisteredTeamSchema } },
      },
      400: { description: "Invalid team" },
      401: { description: "Unauthorized or signature expired" },
      403: { description: "Invalid signature" },
      500: { description: "Server error" },
    },
    security: [{ lovatSignature: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/registeredteams/{team}/reject",
    tags: ["Manager - Registered Teams"],
    summary: "Reject team",
    description:
      "Requires `x-signature` and `x-timestamp` headers. Signs request body, method, path.",
    request: { params: TeamParamSchema, headers: LovatTimestampHeader },
    responses: {
      200: {
        description: "Rejection message",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid team" },
      401: { description: "Unauthorized or signature expired" },
      403: { description: "Invalid signature" },
      500: { description: "Server error" },
    },
    security: [{ lovatSignature: [] }],
  });
}
