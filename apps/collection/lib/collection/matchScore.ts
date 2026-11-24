import type { MatchEvent } from "./MatchEvent";
import { MatchEventType } from "./MatchEventType";

/**
 * Points recorded by scoring events so far.
 *
 * This mirrors the Server's `points` column: the quantity on each
 * `StopScoring` event is the number of points earned by that volley. Climb
 * points are excluded because the climb level is chosen after the match, so a
 * live total can only cover scoring.
 */
export function totalScoredPoints(events: readonly MatchEvent[]): number {
  return events.reduce(
    (total, event) =>
      event.type === MatchEventType.StopScoring
        ? total + (event.quantity ?? 0)
        : total,
    0,
  );
}
