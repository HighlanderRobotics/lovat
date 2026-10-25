import z from "zod";
import {
  AutoClimb,
  Beached,
  ClimbPosition,
  ClimbSide,
  EndgameClimb,
  FeederType,
  FieldTraversal,
  IntakeType,
  MatchType,
  RobotRole,
} from "@lovat/db";
import { EventActionMap, PositionMap } from "../manager/managerConstants.js";
import { customPostMatchAnswersSchema } from "../../lib/customPostMatch.js";
import { timestampSchema } from "./ownedReport.js";

const eventSchema = z
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
    const action = EventActionMap[event[1]];

    if (!action || !PositionMap[event[2]]) {
      ctx.addIssue({
        code: "custom",
        message: "Unknown event action or position.",
      });
    }

    if (
      ["STOP_SCORING", "STOP_FEEDING"].includes(action) &&
      event[3] === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Scoring and feeding stop events require a quantity.",
      });
    }
  });

export const reportSchema = z.object({
  customPostMatch: customPostMatchAnswersSchema.optional().default([]),
  uuid: z.uuid(),
  scouterUuid: z.uuid(),
  tournamentKey: z.string().min(1),
  matchType: z.nativeEnum(MatchType),
  matchNumber: z.number().int().positive(),
  teamNumber: z.number().int().positive(),
  startTime: timestampSchema,

  notes: z.string(),
  robotRoles: z.array(z.nativeEnum(RobotRole)),
  mobility: z.nativeEnum(FieldTraversal),
  climbPosition: z.nativeEnum(ClimbPosition).optional(),
  climbSide: z.nativeEnum(ClimbSide).optional(),
  beached: z.nativeEnum(Beached),
  feederTypes: z.array(z.nativeEnum(FeederType)),
  intakeType: z.nativeEnum(IntakeType),
  robotBrokeDescription: z.string().nullable().optional(),
  driverAbility: z.number().int(),
  accuracy: z.number().int().nullable().optional(),
  disrupts: z.boolean(),
  defenseEffectiveness: z.number().int(),
  scoresWhileMoving: z.boolean(),
  autoClimb: z.nativeEnum(AutoClimb),
  endgameClimb: z.nativeEnum(EndgameClimb),
  appVersion: z.string().optional(),
  events: z.array(eventSchema),
});
