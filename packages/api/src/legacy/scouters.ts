import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ScouterSchema } from "./models.js";

export function registerScoutersPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/v1/manager/emailTeamCode",
    tags: ["Manager - Scouters (Public)"],
    summary: "Email team code to registered address",
    request: { query: z.object({ teamNumber: z.number().int() }) },
    responses: {
      200: {
        description: "Email sent",
        content: {
          "application/json": {
            schema: z.object({ email: z.string().email() }),
          },
        },
      },
      400: { description: "Invalid request" },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/scouter/checkcode",
    tags: ["Manager - Scouters (Public)"],
    summary: "Check team code",
    request: { query: z.object({ code: z.string() }) },
    responses: {
      200: {
        description: "Valid or team row",
        content: { "application/json": { schema: z.any() } },
      },
      400: { description: "Invalid request" },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/name/uuid/{uuid}",
    tags: ["Manager - Scouters (Public)"],
    summary: "Change scouter name by UUID",
    request: {
      params: z.object({ uuid: z.string() }),
      body: {
        content: {
          "application/json": { schema: z.object({ name: z.string() }) },
        },
      },
    },
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid request" },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/scouters",
    tags: ["Manager - Scouters (Public)"],
    summary: "List active scouters for team code",
    request: { headers: z.object({ "x-team-code": z.string() }) },
    responses: {
      200: {
        description: "Scouters",
        content: { "application/json": { schema: z.array(ScouterSchema) } },
      },
      400: { description: "Invalid request" },
      404: { description: "Team code not found" },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/scouter",
    tags: ["Manager - Scouters (Public)"],
    summary: "Create scouter",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamNumber: z.number().int(),
              name: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Created",
        content: { "application/json": { schema: z.any() } },
      },
      400: { description: "Invalid request" },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/scouters/{uuid}/tournaments",
    tags: ["Manager - Scouters (Public)"],
    summary: "List tournaments",
    request: { params: z.object({ uuid: z.string() }) },
    responses: {
      200: {
        description: "Tournaments",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/scouterschedules/{tournament}",
    tags: ["Manager - Scouters (Public)"],
    summary: "Get scouter schedule",
    request: {
      params: z.object({ tournament: z.string() }),
      headers: z.object({ "x-team-code": z.string() }),
    },
    responses: {
      200: {
        description: "Schedule",
        content: { "application/json": { schema: z.any() } },
      },
      400: { description: "Invalid request" },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/scouter/tournaments",
    tags: ["Manager - Scouters (Public)"],
    summary: "List scouter tournaments with schedule",
    request: { headers: z.object({ "x-team-code": z.string() }) },
    responses: {
      200: {
        description: "Tournaments",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
      400: { description: "Invalid request" },
      500: { description: "Server error" },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/unarchive/uuid/{uuid}",
    tags: ["Manager - Scouters"],
    summary: "Unarchive scouter",
    request: { params: z.object({ uuid: z.string() }) },
    responses: {
      200: { description: "Unarchived" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/archive/uuid/{uuid}",
    tags: ["Manager - Scouters"],
    summary: "Archive scouter",
    request: { params: z.object({ uuid: z.string() }) },
    responses: {
      200: { description: "Archived" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "put",
    path: "/v1/manager/scoutername",
    tags: ["Manager - Scouters"],
    summary: "Update scouter name",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ uuid: z.string().optional(), name: z.string() }),
          },
        },
      },
    },
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "delete",
    path: "/v1/manager/scouterdashboard",
    tags: ["Manager - Scouters"],
    summary: "Delete scouter from dashboard",
    responses: {
      200: { description: "Deleted" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/scouterspage",
    tags: ["Manager - Scouters"],
    summary: "Scouting lead progress page",
    responses: {
      200: {
        description: "Page data",
        content: { "application/json": { schema: z.any() } },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/scouterdashboard",
    tags: ["Manager - Scouters"],
    summary: "Add scouter on dashboard",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              scouterId: z.string(),
              tournament: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Created" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/scouterreports",
    tags: ["Manager - Scouters"],
    summary: "List scouter reports",
    responses: {
      200: {
        description: "Reports",
        content: { "application/json": { schema: z.any() } },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
}
