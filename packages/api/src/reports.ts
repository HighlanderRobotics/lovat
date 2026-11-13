import { z } from "zod";

// Tuple positions are a versioned Collection wire contract. Never reorder these.
export const eventActions = [
  "START_SCORING",
  "STOP_SCORING",
  "START_MATCH",
  "START_CAMPING",
  "STOP_CAMPING",
  "START_DEFENDING",
  "STOP_DEFENDING",
  "INTAKE",
  "OUTTAKE",
  "DISRUPT",
  "CROSS",
  "CLIMB",
  "START_FEEDING",
  "STOP_FEEDING",
] as const;
export const eventPositions = [
  "LEFT_TRENCH",
  "LEFT_BUMP",
  "HUB",
  "RIGHT_TRENCH",
  "RIGHT_BUMP",
  "NEUTRAL_ZONE",
  "DEPOT",
  "OUTPOST",
  "NONE",
] as const;
export const timestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(8_640_000_000_000_000);
export const eventTupleSchema = z
  .union([
    z.tuple([z.number().nonnegative(), z.number().int(), z.number().int()]),
    z.tuple([
      z.number().nonnegative(),
      z.number().int(),
      z.number().int(),
      z.number().int().nonnegative(),
    ]),
  ])
  .superRefine((event, ctx) => {
    const action = eventActions[event[1]];
    if (!action || !eventPositions[event[2]]) {
      ctx.addIssue({
        code: "custom",
        message: "Unknown event action or position.",
      });
    }
    if (
      (action === "STOP_SCORING" || action === "STOP_FEEDING") &&
      event[3] === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Scoring and feeding stop events require a quantity.",
      });
    }
  });

// Existing Collection report fields, independent of Prisma and server imports.
export const reportSchema = z.object({
  uuid: z.uuid(),
  scouterUuid: z.uuid(),
  tournamentKey: z.string().min(1),
  matchType: z.enum(["QUALIFICATION", "ELIMINATION", "PRACTICE"]),
  matchNumber: z.number().int().positive(),
  teamNumber: z.number().int().positive(),
  startTime: timestampSchema,
  notes: z.string(),
  robotRoles: z.array(
    z.enum(["CYCLING", "SCORING", "FEEDING", "DEFENDING", "IMMOBILE"]),
  ),
  mobility: z.enum(["TRENCH", "BUMP", "BOTH", "NONE"]),
  climbPosition: z.enum(["SIDE", "MIDDLE"]).optional(),
  climbSide: z.enum(["FRONT", "BACK"]).optional(),
  beached: z.enum(["ON_FUEL", "ON_BUMP", "BOTH", "NEITHER"]),
  feederTypes: z.array(z.enum(["CONTINUOUS", "STOP_TO_SHOOT", "DUMP"])),
  intakeType: z.enum(["GROUND", "OUTPOST", "BOTH", "NEITHER"]),
  robotBrokeDescription: z.string().nullable().optional(),
  driverAbility: z.number().int(),
  accuracy: z.number().int().nullable().optional(),
  disrupts: z.boolean(),
  defenseEffectiveness: z.number().int(),
  scoresWhileMoving: z.boolean(),
  autoClimb: z.enum(["NOT_ATTEMPTED", "FAILED", "SUCCEEDED"]),
  endgameClimb: z.enum(["NOT_ATTEMPTED", "FAILED", "L1", "L2", "L3"]),
  appVersion: z.string().optional(),
  events: z.array(eventTupleSchema),
});

export type ReportSubmission = z.infer<typeof reportSchema>;
export type EventTuple = z.infer<typeof eventTupleSchema>;
