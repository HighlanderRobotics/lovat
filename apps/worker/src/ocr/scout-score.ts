/** The same 2026 report score used by Dashboard: accuracy-adjusted shooting,
 * plus reported auto and endgame climbs. This is a comparison baseline only. */
export function scoutReportPoints(report: {
  accuracy: number | null;
  autoClimb: string;
  endgameClimb: string;
  events: { action: string; points: number; analysisExcluded: boolean }[];
}) {
  const accuracy = [25, 55, 65, 75, 85, 95][report.accuracy ?? -1] ?? 100;
  const climb = { NOT_ATTEMPTED: 0, FAILED: 0, L1: 10, L2: 20, L3: 30 };
  if (!(report.endgameClimb in climb)) throw new Error("Invalid report climb");
  return (
    (report.events
      .filter((e) => e.action === "STOP_SCORING" && !e.analysisExcluded)
      .reduce((sum, e) => sum + e.points, 0) *
      accuracy) /
      100 +
    (report.autoClimb === "SUCCEEDED" ? 15 : 0) +
    climb[report.endgameClimb as keyof typeof climb]
  );
}

export function averageScoutPoints(
  reports: {
    teamNumber: number;
    sourceTeamNumber: number;
    analysisExcluded: boolean;
    scoutPoints?: number | null;
  }[],
  teamNumber: number,
  sources: number[],
) {
  const selected = reports.filter(
    (r) =>
      r.teamNumber === teamNumber &&
      sources.includes(r.sourceTeamNumber) &&
      !r.analysisExcluded,
  );
  // A partial baseline must never be subtracted from the full estimate.
  return selected.length && selected.every((r) => r.scoutPoints != null)
    ? selected
        .sort((a, b) => a.scoutPoints! - b.scoutPoints!)
        .reduce((sum, r) => sum + r.scoutPoints!, 0) / selected.length
    : null;
}
