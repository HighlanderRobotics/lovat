import { z } from "zod";

export const metricMetadataSchema = z.object({
  id: z.string().min(1),
  aliases: z.array(z.string()),
  season: z.number().int(),
  version: z.number().int().positive(),
  label: z.string(),
  unit: z.string(),
  kind: z.enum(["number", "distribution", "structured"]),
  precision: z.number().int().min(0).max(8),
  missing: z.literal("exclude"),
  dependencies: z.array(z.string()),
  outputSchema: z.record(z.string(), z.json()).optional(),
  requires: z.array(z.string()),
});
export type MetricMetadata = z.infer<typeof metricMetadataSchema>;
export const metricValueSchema = z.json();
export type MetricValue = z.infer<typeof metricValueSchema>;
export const metricResultSchema = z.object({
  value: metricValueSchema.nullable(),
  samples: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});
export const analysisRequestSchema = z
  .object({
    teams: z.array(z.number().int().positive()).min(1).max(100),
    metrics: z.array(z.string().min(1).max(100)).min(1).max(64),
    season: z.number().int().min(2000).max(2100).default(2026),
    timeline: z.boolean().default(false),
  })
  .strict();
export const analysisResponseSchema = z.object({
  season: z.number().int(),
  teams: z.record(
    z.string(),
    z.object({
      metrics: z.record(z.string(), metricResultSchema),
      timeline: z
        .array(
          z.object({
            matchKey: z.string(),
            tournamentKey: z.string(),
            metrics: z.record(z.string(), metricResultSchema),
          }),
        )
        .optional(),
    }),
  ),
});
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
