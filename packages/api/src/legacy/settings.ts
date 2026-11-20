import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export function registerSettingsPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "put",
    path: "/v1/manager/settings",
    tags: ["Manager - Settings"],
    summary: "Update sources",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSource: z.array(z.number().int()),
              tournamentSource: z.array(z.string()),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: { description: "Cannot be performed using an API key" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/settings/teamsource",
    tags: ["Manager - Settings"],
    summary: "Get team source",
    responses: {
      200: {
        description: "Team source",
        content: {
          "application/json": {
            schema: z.union([
              z.literal("THIS_TEAM"),
              z.literal("ALL_TEAMS"),
              z.array(z.number().int()),
            ]),
          },
        },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/settings/teamsource",
    tags: ["Manager - Settings"],
    summary: "Add team source",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.union([
              z.object({ mode: z.literal("ALL_TEAMS") }),
              z.object({ mode: z.literal("THIS_TEAM") }),
              z.object({ teams: z.array(z.number().int()) }),
            ]),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Added",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: { description: "Not affiliated with a team" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/settings/tournamentsource",
    tags: ["Manager - Settings"],
    summary: "Get tournament source",
    responses: {
      200: {
        description: "Tournament source",
        content: { "application/json": { schema: z.array(z.string()) } },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/settings/tournamentsource",
    tags: ["Manager - Settings"],
    summary: "Add tournament source",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ tournaments: z.array(z.string()) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Added",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/settings/teamemail",
    tags: ["Manager - Settings"],
    summary: "Get team email",
    responses: {
      200: {
        description: "Team email",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Team not found" },
      429: { description: "Rate limited" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "put",
    path: "/v1/manager/settings/teamemail",
    tags: ["Manager - Settings"],
    summary: "Update team email",
    request: { query: z.object({ email: z.string().email() }) },
    responses: {
      200: {
        description: "Verification sent",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Team not found" },
      429: { description: "Rate limited" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
}
