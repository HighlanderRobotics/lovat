export type Assignment = {
  matchKey: string;
  matchLabel: string;
  teamNumber: number;
};

export type ScoutingActivityState = {
  phase: "waiting" | "onShift";
  nowMatch: string;
  assignments: Assignment[];
  tournamentName: string;
  nextStartTime: number | null;
  updatedAt: number;
};

export type ScheduledMatch = {
  ordinal: number;
  matchKey: string;
  matchLabel: string;
  complete: boolean;
  startTime: number | null;
  assignment: { teamNumber: number; submitted: boolean } | null;
};

// Finals use the provider's final-series number, never the legacy playoff ordinal.
export function activityMatchLabel(
  type: string,
  number: number,
  canonical?: { competitionLevel: string; matchNumber: number } | null,
): string {
  if (canonical?.competitionLevel === "FINAL") {
    return `F${canonical.matchNumber}`;
  }

  if (type === "QUALIFICATION") {
    return `Q${number}`;
  }

  return type === "ELIMINATION" ? `P${number}` : `PM${number}`;
}

export function buildActivityState(
  matches: ScheduledMatch[],
  tournamentName: string,
  now = Date.now(),
): ScoutingActivityState | null {
  const pending = [...matches]
    .filter((match) => !match.complete)
    .sort((a, b) => a.ordinal - b.ordinal);
  const assigned = pending.filter(
    (match) => match.assignment && !match.assignment.submitted,
  );

  if (!assigned.length) {
    return null;
  }

  return {
    phase: pending[0].ordinal < assigned[0].ordinal ? "waiting" : "onShift",
    nowMatch: pending[0].matchLabel,
    assignments: assigned.slice(0, 4).map((match) => ({
      matchKey: match.matchKey,
      matchLabel: match.matchLabel,
      teamNumber: match.assignment!.teamNumber,
    })),
    tournamentName,
    nextStartTime: assigned[0].startTime,
    updatedAt: Math.floor(now / 1000),
  };
}
