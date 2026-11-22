import { rules2026 } from "./rules.js";
import { eventActions, type ReportSubmission } from "@lovat/api";
export function plausible2026(
  data: Pick<ReportSubmission, "events" | "autoClimb" | "endgameClimb">,
  officialScore?: number,
) {
  const fuel = data.events.reduce(
    (sum, event) =>
      sum + (eventActions[event[1]] === "STOP_SCORING" ? (event[3] ?? 0) : 0),
    0,
  );
  const total =
    fuel +
    (data.autoClimb === "SUCCEEDED" ? rules2026.autoClimbPoints : 0) +
    (rules2026.endgamePoints[data.endgameClimb] ?? 0);
  return (
    total <= rules2026.reportFlagThreshold &&
    (officialScore === undefined || fuel <= officialScore)
  );
}
