export type ScheduledTeam = {
  number: number;
  alliance: "red" | "blue" | null;
};

/**
 * Team numbers the match schedule lists for one alliance, in schedule order.
 *
 * The match schedule is cached on the device, so this works without a network
 * connection. An empty result means the schedule is missing, the match has not
 * been published, or its alliance data is incomplete; callers fall back to
 * manual team entry so a scouter can still start a match offline.
 */
export function scheduledTeamsForAlliance(
  teams: readonly ScheduledTeam[] | undefined,
  alliance: "red" | "blue",
): number[] {
  if (!teams) return [];

  return teams
    .filter((team) => team.alliance === alliance)
    .map((team) => team.number);
}
