import {
  gameDescriptorSchema,
  gameReportEnvelopeSchema,
  gamePredictionRequestSchema,
  gamePredictionResultSchema,
} from "./games.js";
import { z } from "zod";
import {
  analysisRequestSchema,
  analysisResponseSchema,
  metricMetadataSchema,
} from "./metrics.js";

export interface Route<I extends z.ZodType, O extends z.ZodType> {
  method: "GET" | "POST";
  path: string;
  auth: "public" | "dashboard" | "collection";
  input: I;
  output: O;
}
function route<I extends z.ZodType, O extends z.ZodType>(
  definition: Route<I, O>,
): Route<I, O> {
  return definition;
}
export const routes = {
  predictGame: route({
    method: "POST",
    path: "/v3/prediction",
    auth: "dashboard",
    input: gamePredictionRequestSchema,
    output: gamePredictionResultSchema,
  }),
  games: route({
    method: "GET",
    path: "/v3/games",
    auth: "public",
    input: z.object({}),
    output: z.array(gameDescriptorSchema),
  }),
  submitGameReport: route({
    method: "POST",
    path: "/v3/reports",
    auth: "collection",
    input: gameReportEnvelopeSchema,
    output: z.object({
      uuid: z.uuid(),
      created: z.boolean(),
      gameId: z.string(),
      gameVersion: z.number().int(),
      reportVersion: z.number().int(),
    }),
  }),

  metrics: route({
    method: "GET",
    path: "/v3/metrics",
    auth: "dashboard",
    input: z.object({
      season: z.coerce.number().int().min(1992).max(2200).optional(),
      gameVersion: z.coerce.number().int().positive().optional(),
    }),
    output: z.array(metricMetadataSchema),
  }),
  analyze: route({
    method: "POST",
    path: "/v3/analysis",
    auth: "dashboard",
    input: analysisRequestSchema,
    output: analysisResponseSchema,
  }),
};
