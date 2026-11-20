import { eventActions, type ReportSubmission } from "@lovat/api";
import { GameError } from "../errors.js";
export function normalizeTimeline<
  T extends Pick<ReportSubmission, "events" | "appVersion">,
>(report: T, duration = Infinity): T {
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
      throw new GameError(
        400,
        "INVALID_TIMELINE",
        "Events must be ordered and within the match duration",
      );
    previous = event[0];
    if (action.startsWith("START_") && action !== "START_MATCH") {
      if (active)
        throw new GameError(400, "INVALID_TIMELINE", "Actions cannot overlap");
      active = action.slice(6);
    } else if (action.startsWith("STOP_")) {
      if (active !== action.slice(5))
        throw new GameError(
          400,
          "INVALID_TIMELINE",
          "Stop events must match an active action",
        );
      active = null;
    }
  }
  if (active)
    throw new GameError(
      400,
      "INVALID_TIMELINE",
      "Action is missing its stop event",
    );
  return { ...report, events };
}
