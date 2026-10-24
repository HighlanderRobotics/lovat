import { z } from "zod";
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
  "DROP",
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
    if (scoring !== (event.scoringLocation !== undefined))
      ctx.addIssue({
        code: "custom",
        message: "Only scoring events require a scoring location.",
      });
    if ((event.action === "START_POSITION") !== (event.position !== undefined))
      ctx.addIssue({
        code: "custom",
        message: "Only the starting event requires a drag-bar position.",
      });
  });
export type ChargedUpEvent = z.infer<typeof eventSchema>;
export const chargedUpReportSchema = z.object({
  gameYear: z.literal(2023),
  appVersion: z.string().optional(),
  uuid: z.string(),
  tournamentKey: z.string(),
  matchType: z.enum(["QUALIFICATION", "ELIMINATION", "PRACTICE"]),
  matchNumber: z.number().int().positive(),
  startTime: z.number(),
  teamNumber: z.number().int().positive(),
  scouterUuid: z.string(),
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
export type PostMatchData = Pick<
  ChargedUpReport,
  | "robotRoles"
  | "driverAbility"
  | "defenseEffectiveness"
  | "activeDefensePercentage"
  | "intakeType"
  | "intakePieces"
  | "mobility"
  | "endgameResult"
  | "coopertition"
  | "links"
  | "notes"
  | "robotBrokeDescription"
>;
export const initialPostMatch: PostMatchData = {
  robotRoles: [],
  driverAbility: 3,
  defenseEffectiveness: 3,
  activeDefensePercentage: 50,
  intakeType: "NEITHER",
  intakePieces: "NEITHER",
  mobility: "NEITHER",
  endgameResult: "NOT_ATTEMPTED",
  coopertition: false,
  links: 0,
  notes: "",
  robotBrokeDescription: null,
};
// Deriving location and held piece from the timeline makes undo reverse them too.
export function currentLocation(events: ChargedUpEvent[]): FieldLocation {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].action === "ENTER_ZONE") return events[i].location;
    if (events[i].action === "LEAVE_ZONE") return "CENTER";
  }
  return "ALLIANCE_ZONE";
}
export function heldPiece(events: ChargedUpEvent[]): GamePiece | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].action === "INTAKE_CONE") return "CONE";
    if (events[i].action === "INTAKE_CUBE") return "CUBE";
    if (["SCORE_CONE", "SCORE_CUBE", "DROP"].includes(events[i].action))
      return null;
  }
  return null;
}
