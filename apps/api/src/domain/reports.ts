import {
  eventActions,
  eventPositions,
  type ReportSubmission,
} from "@lovat/api";
import type { Prisma } from "@lovat/db";
import { plausible2026 } from "@lovat/games/2026";

export { normalizeTimeline } from "@lovat/games/2026";
export function canonicalPayload(
  report: ReportSubmission,
): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(report)) as Prisma.InputJsonObject;
}
export function persistenceData(
  report: ReportSubmission,
  teamMatchKey: string,
  training = false,
  session: string | null = null,
) {
  const {
    uuid,
    scouterUuid,
    notes,
    robotRoles,
    driverAbility,
    autoClimb,
    endgameClimb,
    beached,
    feederTypes,
    intakeType,
    defenseEffectiveness,
    scoresWhileMoving,
    climbPosition,
    climbSide,
    disrupts,
  } = report;
  return {
    uuid,
    scouterUuid,
    teamMatchKey,
    startTime: new Date(report.startTime),
    training,
    trainingSessionUuid: session,
    notes,
    robotRoles,
    driverAbility,
    autoClimb,
    endgameClimb,
    beached,
    feederTypes,
    intakeType,
    defenseEffectiveness,
    scoresWhileMoving,
    climbPosition,
    climbSide,
    disrupts,
    accuracy: report.accuracy ?? null,
    robotBrokeDescription: report.robotBrokeDescription ?? null,
    fieldTraversal: report.mobility,
    reliability: !plausible2026(report)
      ? ("FLAGGED_SYSTEM" as const)
      : ("UNVERIFIED" as const),
    events: {
      create: report.events.map(([time, action, position, quantity]) => ({
        time,
        action: eventActions[action],
        position: eventPositions[position],
        points: eventActions[action] === "STOP_SCORING" ? (quantity ?? 0) : 0,
        quantity: ["STOP_SCORING", "STOP_FEEDING"].includes(
          eventActions[action],
        )
          ? (quantity ?? 0)
          : 0,
      })),
    },
  };
}
