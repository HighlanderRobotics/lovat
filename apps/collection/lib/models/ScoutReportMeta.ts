import { AllianceColor } from "./AllianceColor";
import { matchIdentitySchema } from "./match";
import { z } from "zod";

export const scoutReportMetaSchema = z.object({
  scouterUUID: z.string(),
  matchIdentity: matchIdentitySchema,
  teamNumber: z.number(),
  allianceColor: z.nativeEnum(AllianceColor),
  collection: z
    .object({
      sourceTeamNumber: z.number(),
      endTime: z.number().optional(),
      trainingAttemptUuid: z.string().uuid().optional(),
      trainingSessionUuid: z.string().uuid().optional(),
    })
    .optional(),
});

export type ScoutReportMeta = z.infer<typeof scoutReportMetaSchema>;
