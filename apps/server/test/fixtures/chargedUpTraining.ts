import { randomUUID } from "node:crypto";
import {
  chargedUpReportSchema,
  type ChargedUpReport,
} from "../../src/handler/training/chargedUpReport.js";

// Synthetic data for tests only; this is not a curated training exercise.
export function chargedUpFixture(
  overrides: Partial<ChargedUpReport> = {},
): ChargedUpReport {
  return chargedUpReportSchema.parse({
    uuid: randomUUID(),
    scouterUuid: randomUUID(),
    gameYear: 2023,
    tournamentKey: "2023synthetic",
    matchType: "QUALIFICATION",
    matchNumber: 1,
    teamNumber: 8033,
    startTime: 1000,
    preloadedPiece: "CONE",
    fieldPieces: ["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
    robotRoles: ["OFFENCE"],
    driverAbility: 5,
    defenseEffectiveness: 3,
    activeDefensePercentage: 50,
    intakeType: "GROUND",
    intakePieces: "CUBE",
    mobility: "TOP",
    endgameResult: "SUCCEEDED",
    coopertition: false,
    links: 0,
    notes: "Synthetic training fixture",
    robotBrokeDescription: null,
    events: [
      {
        time: 0,
        action: "START_POSITION",
        location: "START_POSITION",
        position: 50,
      },
      {
        time: 3,
        action: "SCORE_CONE",
        location: "SCORE",
        scoringLocation: "A1",
      },
      { time: 5, action: "LEAVE_ZONE", location: "ALLIANCE_ZONE" },
      { time: 7, action: "INTAKE_CUBE", location: "CENTER" },
      { time: 10, action: "ENTER_ZONE", location: "ALLIANCE_ZONE" },
      {
        time: 12,
        action: "SCORE_CUBE",
        location: "SCORE",
        scoringLocation: "B2",
      },
      { time: 145, action: "ENDGAME", location: "CHARGER" },
    ],
    ...overrides,
  });
}
