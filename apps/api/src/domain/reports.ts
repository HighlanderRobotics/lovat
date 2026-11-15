import {
  eventActions,
  eventPositions,
  type ReportSubmission,
} from "@lovat/api";
import type { Prisma } from "@lovat/db";
import { HttpError } from "../errors.js";

export function normalizeTimeline(
  report: ReportSubmission,
  duration = Infinity,
): ReportSubmission {
  let events = report.events;
  if (["26.0.3", "26.0.4"].includes(report.appVersion ?? "")) {
    events = events.filter((event, index) => {
      const action = eventActions[event[1]];
      return (
        !action.startsWith("START_") ||
        action === "START_MATCH" ||
        eventActions[events[index + 1]?.[1]] ===
          action.replace("START_", "STOP_")
      );
    });
  }
  let active: string | null = null;
  let previous = -1;
  for (const event of events) {
    const action = eventActions[event[1]];
    if (event[0] < previous || event[0] > duration)
      throw new HttpError(
        400,
        "INVALID_TIMELINE",
        "Events must be ordered and within the match duration",
      );
    previous = event[0];
    if (action.startsWith("START_") && action !== "START_MATCH") {
      if (active)
        throw new HttpError(400, "INVALID_TIMELINE", "Actions cannot overlap");
      active = action.slice(6);
    } else if (action.startsWith("STOP_")) {
      if (active !== action.slice(5))
        throw new HttpError(
          400,
          "INVALID_TIMELINE",
          "Stop events must match an active action",
        );
      active = null;
    }
  }
  if (active)
    throw new HttpError(
      400,
      "INVALID_TIMELINE",
      "Action is missing its stop event",
    );
  return { ...report, events };
}
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
  const total =
    report.events.reduce(
      (sum, event) =>
        sum + (eventActions[event[1]] === "STOP_SCORING" ? (event[3] ?? 0) : 0),
      0,
    ) +
    (autoClimb === "SUCCEEDED" ? 15 : 0) +
    ({ L1: 10, L2: 20, L3: 30, FAILED: 0, NOT_ATTEMPTED: 0 }[endgameClimb] ??
      0);
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
    reliability:
      total > 800 ? ("FLAGGED_SYSTEM" as const) : ("UNVERIFIED" as const),
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
