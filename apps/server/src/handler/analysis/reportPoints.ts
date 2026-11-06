import { AutoClimb, EndgameClimb } from "@lovat/db";

export const endgameToPoints: Record<EndgameClimb, number> = {
  [EndgameClimb.NOT_ATTEMPTED]: 0,
  [EndgameClimb.FAILED]: 0,
  [EndgameClimb.L1]: 10,
  [EndgameClimb.L2]: 20,
  [EndgameClimb.L3]: 30,
};

export function calculateReportTotalPoints(report: {
  endgameClimb: EndgameClimb;
  autoClimb: AutoClimb;
  events: { points: number }[];
}): number {
  return (
    endgameToPoints[report.endgameClimb] +
    (report.autoClimb === AutoClimb.SUCCEEDED ? 15 : 0) +
    report.events.reduce((total, event) => total + event.points, 0)
  );
}
