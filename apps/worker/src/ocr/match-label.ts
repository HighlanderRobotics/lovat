import type { Match } from "@lovat/db";
/** Candidate labels for 2026 double-elimination broadcasts, where TBA stores
 * playoff rounds as sf<N>m1. They are never accepted on naming alone: the
 * native service must verify the literal label and roster on two frames. */
export function eventMatchLabel(
  match: Pick<Match, "competitionLevel" | "setNumber" | "matchNumber">,
  playoffType: number | null,
) {
  if (match.competitionLevel === "QUALIFICATION")
    return `Qualification ${match.matchNumber}`;
  if (playoffType === 10 || playoffType === 11) {
    if (match.competitionLevel === "SEMIFINAL" && match.matchNumber === 1)
      return `Playoff ${match.setNumber}`;
    if (match.competitionLevel === "FINAL" && match.setNumber === 1)
      return `Final ${match.matchNumber}`;
  }
  return `${match.competitionLevel} ${match.setNumber} ${match.matchNumber}`;
}
