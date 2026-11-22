import { z } from "zod";
import { timestampSchema } from "./common.js";
export const collectionIdentityHeadersSchema = z.object({
  "x-team-code": z.string().min(1).max(256),
  "x-scouter-uuid": z.uuid(),
  "x-device-id": z.string().min(1).max(200),
});
export const loadReportSchema = z.object({
  uuid: z.uuid(),
  teamNumber: z.coerce.number().int().positive().optional(),
  trainingAttemptUuid: z.uuid().optional(),
  matchIdentity: z
    .object({
      tournamentKey: z.string().min(1),
      matchType: z.enum(["QUALIFICATION", "ELIMINATION", "PRACTICE"]),
      matchNumber: z.number().int().positive(),
    })
    .optional(),
});
export const startReportSchema = z.object({
  uuid: z.uuid(),
  startTime: timestampSchema,
});
export const endReportSchema = z.object({
  uuid: z.uuid(),
  endTime: timestampSchema,
});
export const reportReceiptSchema = z.object({ uuid: z.uuid() });
export const trainingSessionCreateSchema = z.object({ videoUuid: z.uuid() });
export const trainingPairSchema = z.object({
  pairingToken: z.string().min(32).max(100),
  deviceName: z.string().trim().min(1).max(80),
});
export const trainingReadySchema = z.object({
  attemptUuid: z.uuid(),
  stage: z.enum(["LOBBY", "ARMED"]).optional(),
});
export const trainingControlSchema = z.object({
  action: z.enum(["arm", "play", "end", "interrupt"]),
  playbackSeconds: z.number().finite().min(0).max(600).optional(),
});
export const trainingSocketCredentialsSchema = z.object({
  sessionUuid: z.uuid(),
  token: z.string().min(32).max(100),
  attemptUuid: z.uuid().optional(),
});
export type LoadReport = z.infer<typeof loadReportSchema>;
export type StartReport = z.infer<typeof startReportSchema>;
export type EndReport = z.infer<typeof endReportSchema>;
export type TrainingControl = z.infer<typeof trainingControlSchema>;
export type TrainingSocketCredentials = z.infer<
  typeof trainingSocketCredentialsSchema
>;
