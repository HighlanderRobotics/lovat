import { randomUUID } from "node:crypto";
import { sourceReportSchema } from "../../src/ocr/report-source";
export function sourceFixture() {
  return sourceReportSchema.parse({
    analysisExcluded: false,
    uuid: randomUUID(),
    scouterUuid: randomUUID(),
    sourceTeamNumber: 8033,
    matchKey: "2026casnf_qm1",
    teamNumber: 118,
    matchType: "QUALIFICATION",
    matchNumber: 1,
    startTime: "2026-03-01T00:00:00Z",
    robotRoles: ["SCORING"],
    driverAbility: 3,
    accuracy: 80,
    beached: "NEITHER",
    climbPosition: null,
    climbSide: null,
    defenseEffectiveness: 0,
    feederTypes: [],
    intakeType: "NEITHER",
    fieldTraversal: "NONE",
    scoresWhileMoving: false,
    disrupts: false,
    endgameClimb: "NOT_ATTEMPTED",
    autoClimb: "NOT_ATTEMPTED",
    events: [
      {
        analysisExcluded: false,
        eventUuid: randomUUID(),
        time: 5,
        action: "START_SCORING",
        position: "NONE",
        points: 0,
        quantity: null,
      },
    ],
  });
}
