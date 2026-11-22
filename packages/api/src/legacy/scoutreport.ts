import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export function registerScoutreportPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/metrics/scoutreport/{uuid}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Scout Report"],
    summary: "Metrics for specific scout report",
    request: { params: z.object({ uuid: z.string() }) },
    responses: {
      200: {
        description: "Metrics",
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
    path: "/v1/analysis/scoutreports/match/{match}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Scout Report"],
    summary: "All scout reports for a match",
    request: { params: z.object({ match: z.coerce.number().int() }) },
    responses: {
      200: {
        description: "Reports",
        content: {
          "application/json": {
            schema: z.array(z.record(z.string(), z.any())),
          },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error or not authorized" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/timeline/scoutreport/{uuid}",
    security: [{ bearerAuth: [] }],
    tags: ["Analysis - Scout Report"],
    summary: "Timeline data for scout report",
    request: { params: z.object({ uuid: z.string() }) },
    responses: {
      200: {
        description: "Timeline",
        content: {
          "application/json": { schema: z.record(z.string(), z.any()) },
        },
      },
      400: { description: "Invalid parameters" },
      500: { description: "Internal server error" },
    },
  });
}
