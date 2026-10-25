// The 2023 training wire contract mirrors Collection. Keep changes coordinated.
import { z } from "zod";
import { customPostMatchAnswersSchema } from "../../lib/customPostMatch.js";
export const AUTO_END_SECONDS = 15;
export const ENDGAME_START_SECONDS = 120;
export const MATCH_END_SECONDS = 150;
export const scoringLocations = "ABCDEFGHI"
  .split("")
  .flatMap((column) => [1, 2, 3].map((row) => `${column}${row}`));
export const locationSchema = z.enum([
  "ALLIANCE_ZONE",
  "OPPONENT_STATION",
  "ALLIANCE_STATION",
  "OPPONENT_ZONE",
  "CENTER",
  "START_POSITION",
  "CHARGER",
  "SCORE",
]);
export type FieldLocation = z.infer<typeof locationSchema>;
export const actionSchema = z.enum([
  "LEAVE_ZONE",
  "ENTER_ZONE",
  "SCORE_CONE",
  "SCORE_CUBE",
  "INTAKE_CONE",
  "INTAKE_CUBE",
  "START_POSITION",
  "ENDGAME",
  "LEAVE_CHARGER",
  "DROP",
  "START_DEFENDING",
  "STOP_DEFENDING",
  // Retain camping actions for reports saved by earlier mock-game builds.
  "START_CAMPING",
  "STOP_CAMPING",
]);
export type ChargedUpAction = z.infer<typeof actionSchema>;
export type GamePiece = "CONE" | "CUBE";
export const eventSchema = z
  .object({
    time: z.number().min(0).max(MATCH_END_SECONDS),
    action: actionSchema,
    location: locationSchema,
    scoringLocation: z
      .string()
      .regex(/^[A-I][1-3]$/)
      .optional(),
    position: z.number().int().min(0).max(100).optional(),
  })
  .superRefine((event, ctx) => {
    const scoring =
      event.action === "SCORE_CONE" || event.action === "SCORE_CUBE";
    if (scoring !== (event.scoringLocation !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "Only scoring events require a scoring location.",
      });
    }
    if (
      (event.action === "START_POSITION") !==
      (event.position !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Only the starting event requires a drag-bar position.",
      });
    }
  });
export type ChargedUpEvent = z.infer<typeof eventSchema>;
export const chargedUpReportSchema = z.object({
  customPostMatch: customPostMatchAnswersSchema.optional().default([]),
  gameYear: z.literal(2023),
  appVersion: z.string().optional(),
  uuid: z.uuid(),
  tournamentKey: z.string(),
  matchType: z.enum(["QUALIFICATION", "ELIMINATION", "PRACTICE"]),
  matchNumber: z.number().int().positive(),
  startTime: z.number(),
  teamNumber: z.number().int().positive(),
  scouterUuid: z.uuid(),
  preloadedPiece: z.enum(["CONE", "CUBE"]).nullable().optional(),
  fieldPieces: z.array(z.enum(["CONE", "CUBE", "UNKNOWN"])).length(4),
  robotRoles: z.array(z.enum(["OFFENCE", "DEFENCE", "FEEDING", "IMMOBILE"])),
  driverAbility: z.number().int().min(1).max(5),
  defenseEffectiveness: z.number().int().min(1).max(5),
  activeDefensePercentage: z.number().int().min(0).max(100),
  intakeType: z.enum(["GROUND", "STATION", "BOTH", "NEITHER"]),
  intakePieces: z.enum(["CONE", "CUBE", "BOTH", "NEITHER"]),
  mobility: z.enum(["MIDDLE", "TOP", "BOTH", "NEITHER"]),
  endgameResult: z.enum(["FAILED", "SUCCEEDED", "NOT_ATTEMPTED"]),
  coopertition: z.boolean(),
  links: z.number().int().min(0),
  notes: z.string(),
  robotBrokeDescription: z.string().nullable(),
  events: z.array(eventSchema),
});
export type ChargedUpReport = z.infer<typeof chargedUpReportSchema>;
// Deriving location and held piece from the timeline makes undo reverse them too.
export function currentLocation(events: ChargedUpEvent[]): FieldLocation {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].action === "ENTER_ZONE") {
      return events[i].location;
    }
    if (events[i].action === "LEAVE_ZONE") {
      return "CENTER";
    }
  }
  return "ALLIANCE_ZONE";
}
export function heldPiece(
  events: ChargedUpEvent[],
  preload: GamePiece | null = null,
): GamePiece | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].action === "INTAKE_CONE") {
      return "CONE";
    }
    if (events[i].action === "INTAKE_CUBE") {
      return "CUBE";
    }
    if (["SCORE_CONE", "SCORE_CUBE", "DROP"].includes(events[i].action)) {
      return null;
    }
  }
  return preload;
}

export type HoldActivity = "DEFENDING" | "CAMPING";
export function activeActivity(events: ChargedUpEvent[]): HoldActivity | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const action = events[i].action;
    if (action === "START_DEFENDING") {
      return "DEFENDING";
    }
    if (action === "START_CAMPING") {
      return "CAMPING";
    }
    if (action === "STOP_DEFENDING" || action === "STOP_CAMPING") {
      return null;
    }
  }
  return null;
}
export function onCharger(events: ChargedUpEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].action === "LEAVE_CHARGER") {
      return false;
    }
    if (events[i].action === "ENDGAME") {
      return true;
    }
  }
  return false;
}
// Rows 1 and 2 are high/middle; row 3 is the hybrid row. B/E/H are cube columns.
export function canScoreAt(
  piece: GamePiece | null,
  scoringLocation: string,
): boolean {
  if (!piece || !/^[A-I][1-3]$/.test(scoringLocation)) {
    return false;
  }
  if (scoringLocation[1] === "3") {
    return true;
  }
  const cubeNode = "BEH".includes(scoringLocation[0]);
  return piece === "CUBE" ? cubeNode : !cubeNode;
}
export function canRecordEvent(
  events: ChargedUpEvent[],
  preload: GamePiece | null,
  event: Omit<ChargedUpEvent, "time">,
): boolean {
  const piece = heldPiece(events, preload);
  const activity = activeActivity(events);
  if (onCharger(events)) {
    return event.action === "LEAVE_CHARGER" && event.location === "CHARGER";
  }
  if (event.action === "LEAVE_CHARGER") {
    return false;
  }
  if (event.action === "ENDGAME") {
    return (
      !activity &&
      currentLocation(events) === "ALLIANCE_ZONE" &&
      event.location === "CHARGER"
    );
  }
  if (event.action === "STOP_DEFENDING" || event.action === "STOP_CAMPING") {
    return (
      activity ===
        (event.action === "STOP_DEFENDING" ? "DEFENDING" : "CAMPING") &&
      event.location === events.at(-1)?.location
    );
  }
  if (activity || event.action === "START_CAMPING") {
    return false;
  }
  if (event.action === "START_DEFENDING") {
    return (
      event.location === "OPPONENT_ZONE" ||
      event.location === "OPPONENT_STATION"
    );
  }
  if (event.action === "INTAKE_CONE" || event.action === "INTAKE_CUBE") {
    return piece === null;
  }
  if (event.action === "DROP") {
    return piece !== null;
  }
  if (event.action === "SCORE_CONE" || event.action === "SCORE_CUBE") {
    const expected = event.action === "SCORE_CONE" ? "CONE" : "CUBE";
    return (
      currentLocation(events) === "ALLIANCE_ZONE" &&
      event.location === "SCORE" &&
      piece === expected &&
      canScoreAt(piece, event.scoringLocation ?? "")
    );
  }
  return event.action !== "START_POSITION";
}
