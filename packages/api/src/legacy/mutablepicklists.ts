import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { MutablePicklistSchema } from "./models.js";

export function registerMutablepicklistsPaths(registry: OpenAPIRegistry) {
  const MutablePicklistCreateSchema = z.object({
    name: z.string(),
    teams: z.array(z.number().int()),
    tournamentKey: z.string().optional(),
  });
  const MutablePicklistListItemSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    tournamentKey: z.string().nullable().optional(),
    author: z.object({ username: z.string().nullable().optional() }),
  });
  registry.registerPath({
    method: "post",
    path: "/v1/manager/mutablepicklists",
    tags: ["Manager - Mutable Picklists"],
    summary: "Create mutable picklist",
    request: {
      body: {
        content: {
          "application/json": { schema: MutablePicklistCreateSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Created",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: {
        description:
          "Cannot be performed using an API key, or user is not on a team",
      },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/mutablepicklists",
    tags: ["Manager - Mutable Picklists"],
    summary: "List mutable picklists",
    responses: {
      200: {
        description: "List",
        content: {
          "application/json": {
            schema: z.array(MutablePicklistListItemSchema),
          },
        },
      },
      401: { description: "Unauthorized" },
      403: { description: "User is not on a team" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/manager/mutablepicklists/{uuid}",
    tags: ["Manager - Mutable Picklists"],
    summary: "Get mutable picklist",
    request: { params: z.object({ uuid: z.string() }) },
    responses: {
      200: {
        description: "Detail",
        content: {
          "application/json": { schema: MutablePicklistSchema.nullable() },
        },
      },
      400: { description: "Invalid request" },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "put",
    path: "/v1/manager/mutablepicklists/{uuid}",
    tags: ["Manager - Mutable Picklists"],
    summary: "Update mutable picklist",
    request: {
      params: z.object({ uuid: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string(),
              teams: z.array(z.number().int()),
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
      404: { description: "Picklist not found or not on same team" },
      401: { description: "Unauthorized" },
      403: {
        description:
          "Cannot be performed using an API key, or not authorized to update",
      },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "delete",
    path: "/v1/manager/mutablepicklists/{uuid}",
    tags: ["Manager - Mutable Picklists"],
    summary: "Delete mutable picklist",
    request: { params: z.object({ uuid: z.string() }) },
    responses: {
      200: {
        description: "Deleted",
        content: { "text/plain": { schema: z.string() } },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: {
        description:
          "Cannot be performed using an API key, or not authorized to delete",
      },
      404: { description: "Not found" },
      500: { description: "Server error" },
    },
    security: [{ bearerAuth: [] }],
  });
}
