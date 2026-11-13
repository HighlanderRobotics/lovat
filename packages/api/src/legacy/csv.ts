import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export function registerCsvPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/csvplain",
    tags: ["Analysis - CSV"],
    summary: "Team CSV",
    request: {
      query: z.object({
        team: z.coerce.number().int(),
        tournamentKey: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "CSV",
        content: { "text/csv": { schema: z.string() } },
      },
      400: { description: "Invalid parameters or not enough scouting data" },
      500: { description: "Internal server error" },
    },
    security: [{ bearerAuth: [] }],
  });
  registry.registerPath({
    method: "get",
    path: "/v1/analysis/reportcsv",
    tags: ["Analysis - CSV"],
    summary: "Report CSV",
    request: { query: z.object({ tournamentKey: z.string() }) },
    responses: {
      200: {
        description: "CSV",
        content: { "text/csv": { schema: z.string() } },
      },
      400: { description: "Invalid parameters or not enough scouting data" },
      500: { description: "Internal server error" },
    },
    security: [{ bearerAuth: [] }],
  });
}
