import type { eventActions, eventPositions } from "@lovat/api";

export interface AnalysisEvent {
  action: (typeof eventActions)[number];
  position: (typeof eventPositions)[number];
  time: number;
  quantity: number | null;
  points: number;
}
export interface ReportInput {
  uuid: string;
  teamNumber: number;
  matchKey: string;
  tournamentKey: string;
  tournamentDate: string;
  events: readonly AnalysisEvent[];
  driverAbility: number;
  defenseEffectiveness: number;
  accuracy: number | null;
  autoClimb: string;
  endgameClimb: string;
  robotRoles: readonly string[];
  feederTypes: readonly string[];
  fieldTraversal: string;
  beached: string;
  scoresWhileMoving: boolean;
  disrupts: boolean;
  intakeType: string;
}
export interface Facts {
  report: ReportInput;
  counts: Readonly<Record<string, number>>;
  quantity: Readonly<Record<string, number>>;
  durations: Readonly<Record<string, number>>;
  firstClimbAuto: number | null;
  firstClimbTeleop: number | null;
  autoPoints: number;
  teleopPoints: number;
  outpostIntakes: number;
}

/** Stable ordering; repeated starts do not manufacture intervals or double count time. */
export function prepareFacts(report: ReportInput): Facts {
  const counts: Record<string, number> = {};
  const quantity: Record<string, number> = {};
  const durations: Record<string, number> = {};
  const active = new Map<string, number>();
  const pairs: Record<string, string> = {
    STOP_SCORING: "START_SCORING",
    STOP_FEEDING: "START_FEEDING",
    STOP_DEFENDING: "START_DEFENDING",
    STOP_CAMPING: "START_CAMPING",
  };
  let firstClimbAuto: number | null = null;
  let firstClimbTeleop: number | null = null;
  let autoPoints = 0;
  let teleopPoints = 0;
  let outpostIntakes = 0;
  for (const event of [...report.events].sort((a, b) => a.time - b.time)) {
    if (!Number.isFinite(event.time) || event.time < 0) {
      throw new Error("Invalid event time");
    }
    counts[event.action] = (counts[event.action] ?? 0) + 1;
    quantity[event.action] =
      (quantity[event.action] ?? 0) + (event.quantity ?? 0);
    if (event.action.startsWith("START_") && !active.has(event.action)) {
      active.set(event.action, event.time);
    }
    const start = pairs[event.action];
    if (start) {
      const startedAt = active.get(start);
      if (startedAt !== undefined) {
        const duration = event.time - startedAt;
        const minimum =
          start === "START_SCORING" || start === "START_FEEDING" ? 0.5 : 0;
        if (duration >= minimum) {
          durations[start] = (durations[start] ?? 0) + duration;
        }
        active.delete(start);
      }
    }
    if (event.action === "CLIMB") {
      if (event.time <= 23) {
        firstClimbAuto ??= event.time;
      } else {
        firstClimbTeleop ??= event.time;
      }
    }
    if (event.action === "STOP_SCORING") {
      if (event.time <= 23) {
        autoPoints += event.points;
      } else {
        teleopPoints += event.points;
      }
    }
    if (event.action === "INTAKE" && event.position === "OUTPOST") {
      outpostIntakes++;
    }
  }
  return {
    report,
    counts,
    quantity,
    durations,
    firstClimbAuto,
    firstClimbTeleop,
    autoPoints,
    teleopPoints,
    outpostIntakes,
  };
}
