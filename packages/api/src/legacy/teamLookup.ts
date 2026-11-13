import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export function registerTeamLookupPaths(registry: OpenAPIRegistry) {
  const TeamParam = z.object({ team: z.string() });
  const MetricTeamParam = z.object({ metric: z.string(), team: z.string() });
  const BreakdownParam = z.object({ team: z.string(), breakdown: z.string() });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/metric/{metric}/team/{team}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Team Lookup"],
    summary: "Metric details for team",
    request: { params: MetricTeamParam },
    responses: {
      200: {
        description: "Details",
        content: {
          "application/json": { schema: z.record(z.string(), z.any()) },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/category/team/{team}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Team Lookup"],
    summary: "Category metrics for team",
    request: { params: TeamParam },
    responses: {
      200: {
        description: "Categories",
        content: {
          "application/json": { schema: z.record(z.string(), z.any()) },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/breakdown/team/{team}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Team Lookup"],
    summary: "Breakdown metrics for team",
    request: { params: TeamParam },
    responses: {
      200: {
        description: "Breakdown",
        content: {
          "application/json": { schema: z.record(z.string(), z.any()) },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/breakdown/team/{team}/{breakdown}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Team Lookup"],
    summary: "Specific breakdown details",
    request: { params: BreakdownParam },
    responses: {
      200: {
        description: "Details",
        content: {
          "application/json": { schema: z.record(z.string(), z.any()) },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/notes/team/{team}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Team Lookup"],
    summary: "Notes for team",
    request: { params: TeamParam },
    responses: {
      200: {
        description: "Notes",
        content: {
          "application/json": {
            schema: z.array(z.object({ note: z.string() })),
          },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/flag/team/{team}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Team Lookup"],
    summary: "Flags for team",
    request: { params: TeamParam },
    responses: {
      200: {
        description: "Flags",
        content: {
          "application/json": {
            schema: z.array(z.object({ flag: z.string() })),
          },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error" },
    },
  });
}
