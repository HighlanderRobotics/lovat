const tbaEventOrigin = "https://www.thebluealliance.com";

const eventPaths = {
  event: "",
  matches: "/matches",
  teams: "/teams",
  simpleTeams: "/teams/simple",
  teamStatuses: "/teams/statuses",
  rankings: "/rankings",
} as const;

export function tbaEventUrl(
  tournamentKey: string,
  resource: keyof typeof eventPaths,
): string {
  // The event identifier is a single path segment, never a host or route.
  if (tournamentKey.length === 0 || /[^a-z0-9_-]/i.test(tournamentKey)) {
    throw new Error("Invalid TBA event key");
  }

  return `${tbaEventOrigin}/api/v3/event/${encodeURIComponent(tournamentKey)}${eventPaths[resource]}`;
}
