import {
  ChargedUpEvent,
  ENDGAME_START_SECONDS,
  PostMatchData,
  onCharger,
} from "./ChargedUp";

// Suggestions describe observed actions; subjective ratings remain manual.
export function postMatchDefaults(
  events: ChargedUpEvent[],
  endedAt = events.at(-1)?.time ?? 0,
): Partial<PostMatchData> {
  const intakes = events.filter(
    (e) => e.action === "INTAKE_CONE" || e.action === "INTAKE_CUBE",
  );
  const cone = intakes.some((e) => e.action === "INTAKE_CONE");
  const cube = intakes.some((e) => e.action === "INTAKE_CUBE");
  const ground = intakes.some(
    (e) => e.location === "CENTER" || e.location === "ALLIANCE_ZONE",
  );
  const station = intakes.some((e) => e.location === "ALLIANCE_STATION");
  const robotRoles: PostMatchData["robotRoles"] = [];
  if (
    events.some((e) => e.action === "SCORE_CONE" || e.action === "SCORE_CUBE")
  )
    robotRoles.push("OFFENCE");
  if (
    events.some(
      (e) => e.action === "START_DEFENDING" || e.action === "START_CAMPING",
    )
  )
    robotRoles.push("DEFENCE");
  let active = 0;
  let camping = 0;
  let start: ChargedUpEvent | undefined;
  for (const event of events) {
    if (event.action === "START_DEFENDING" || event.action === "START_CAMPING")
      start = event;
    if (
      (event.action === "STOP_DEFENDING" || event.action === "STOP_CAMPING") &&
      start
    ) {
      const duration = Math.max(0, event.time - start.time);
      if (
        start.action === "START_CAMPING" ||
        start.location === "OPPONENT_STATION"
      )
        camping += duration;
      else active += duration;
      start = undefined;
    }
  }
  const endgameAttempted =
    endedAt >= ENDGAME_START_SECONDS &&
    events.some(
      (e, index) =>
        e.action === "ENDGAME" &&
        (e.time >= ENDGAME_START_SECONDS ||
          (events
            .slice(index + 1)
            .find((later) => later.action === "LEAVE_CHARGER")?.time ??
            endedAt) >= ENDGAME_START_SECONDS),
    );
  return {
    robotRoles,
    intakePieces:
      cone && cube ? "BOTH" : cone ? "CONE" : cube ? "CUBE" : "NEITHER",
    intakeType:
      ground && station
        ? "BOTH"
        : ground
          ? "GROUND"
          : station
            ? "STATION"
            : "NEITHER",
    ...(active + camping > 0
      ? {
          activeDefensePercentage: Math.round(
            (100 * active) / (active + camping),
          ),
        }
      : {}),
    // Remaining on the pad suggests success; the scouter can correct the result.
    endgameResult: !endgameAttempted
      ? "NOT_ATTEMPTED"
      : onCharger(events)
        ? "SUCCEEDED"
        : "FAILED",
  };
}
