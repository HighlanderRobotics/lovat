import { z } from "zod";
import {
  analysisRequestSchema,
  analysisResponseSchema,
  metricMetadataSchema,
} from "./metrics.js";

export interface Route<I extends z.ZodType, O extends z.ZodType> {
  method: "GET" | "POST";
  path: string;
  auth: "public" | "dashboard";
  input: I;
  output: O;
}
function route<I extends z.ZodType, O extends z.ZodType>(
  definition: Route<I, O>,
): Route<I, O> {
  return definition;
}
export const routes = {
  metrics: route({
    method: "GET",
    path: "/v3/metrics",
    auth: "dashboard",
    input: z.object({}),
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
