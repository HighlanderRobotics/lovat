import { z } from "zod";
import { metricMetadataSchema } from "./metrics.js";
import { timestampSchema } from "./common.js";
export const gameRulesSchema = z.object({
  allianceSize: z.number().int().min(1).max(6),
  periods: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string(),
        durationSeconds: z.number().positive(),
      }),
    )
    .min(1)
    .max(10),
  scoring: z.record(z.string(), z.json()),
});
export const gameDescriptorSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  season: z.number().int().min(1992).max(2200),
  version: z.number().int().positive(),
  label: z.string().min(1),
  reportVersion: z.number().int().positive(),
  reportSchemas: z.record(z.string(), z.record(z.string(), z.json())),
  rules: gameRulesSchema,
  metrics: z.array(metricMetadataSchema),
  features: z.object({ predictions: z.boolean() }),
});
export const gameReportEnvelopeSchema = z
  .object({
    uuid: z.uuid(),
    scouterUuid: z.uuid(),
    teamNumber: z.number().int().positive(),
    tournamentKey: z.string().min(1).max(100),
    matchType: z.enum(["QUALIFICATION", "ELIMINATION", "PRACTICE"]),
    matchNumber: z.number().int().positive().max(32767),
    season: z.number().int().min(1992).max(2200),
    gameId: z.string().min(1).max(100),
    gameVersion: z.number().int().positive(),
    reportVersion: z.number().int().positive(),
    startTime: timestampSchema,
    endTime: timestampSchema,
    data: z.record(z.string(), z.json()),
  })
  .strict()
  .refine((report) => report.endTime >= report.startTime, {
    message: "Report must end after it starts",
  });
export type GameDescriptor = z.infer<typeof gameDescriptorSchema>;
export type GameRules = z.infer<typeof gameRulesSchema>;
export type GameReportEnvelope = z.infer<typeof gameReportEnvelopeSchema>;

export const gamePredictionRequestSchema = z
  .object({
    season: z.number().int().min(1992).max(2200),
    gameVersion: z.number().int().positive().optional(),
    red: z.array(z.number().int().positive()).min(1).max(6),
    blue: z.array(z.number().int().positive()).min(1).max(6),
  })
  .strict();
export const gamePredictionResultSchema = z
  .object({
    redWinning: z.number().min(0).max(1),
    blueWinning: z.number().min(0).max(1),
    winningAlliance: z.enum(["red", "blue", "tie"]),
    redScore: z.number(),
    blueScore: z.number(),
    redRankingPoints: z.number().nonnegative().optional(),
    blueRankingPoints: z.number().nonnegative().optional(),
  })
  .refine(
    (value) => Math.abs(value.redWinning + value.blueWinning - 1) < 0.00001,
    { message: "Win probabilities must sum to one" },
  );
export type GamePredictionResult = z.infer<typeof gamePredictionResultSchema>;
