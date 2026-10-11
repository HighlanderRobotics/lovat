import z from "zod";
const nexusMatchSchema = z.object({
  label: z.string(),
  replayOf: z.unknown().optional(),
  redTeams: z.array(z.string().nullable()).optional(),
  blueTeams: z.array(z.string().nullable()).optional(),
});

const nexusEventSchema = z.object({
  matches: z.array(nexusMatchSchema),
});

interface PracticeMatch {
  matchNumber: number;
  teamNumbers: number[];
}

const CACHE_DURATION_MS = 60_000;
const MAX_CACHED_EVENTS = 100;
const scheduleCache = new Map<
  string,
  {
    expiresAt: number;
    matches: PracticeMatch[];
  }
>();
const pendingRequests = new Map<string, Promise<PracticeMatch[]>>();

export const fetchPracticeMatches = async (
  tournamentKey: string,
): Promise<PracticeMatch[]> => {
  const apiKey = process.env.NEXUS_API_KEY?.trim();
  if (!apiKey) return [];

  // Remove expired entries so schedules can be refreshed and memory stays bounded.
  const now = Date.now();
  for (const [key, cached] of scheduleCache) {
    if (cached.expiresAt <= now) scheduleCache.delete(key);
  }

  const cached = scheduleCache.get(tournamentKey);
  if (cached) return structuredClone(cached.matches);

  // Simultaneous imports for one event share a single Nexus request.
  const pending = pendingRequests.get(tournamentKey);
  if (pending) return structuredClone(await pending);

  const request = requestPracticeMatches(tournamentKey, apiKey);
  pendingRequests.set(tournamentKey, request);

  try {
    const matches = await request;
    if (scheduleCache.size >= MAX_CACHED_EVENTS) {
      const oldestKey = scheduleCache.keys().next().value;
      if (oldestKey !== undefined) scheduleCache.delete(oldestKey);
    }
    scheduleCache.set(tournamentKey, {
      expiresAt: Date.now() + CACHE_DURATION_MS,
      matches,
    });
    return structuredClone(matches);
  } finally {
    // Failed requests are not cached, so later imports can retry.
    pendingRequests.delete(tournamentKey);
  }
};

const requestPracticeMatches = async (
  tournamentKey: string,
  apiKey: string,
): Promise<PracticeMatch[]> => {
  const response = await fetch(
    `https://frc.nexus/api/v1/event/${encodeURIComponent(tournamentKey)}`,
    {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Nexus-Api-Key": apiKey,
      },
    },
  );

  // Events that Nexus does not have should not fail the match import.
  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Failed to fetch Nexus event");
  }

  const data: unknown = await response.json();
  const event = nexusEventSchema.parse(data);

  const practiceMatches: PracticeMatch[] = [];

  for (const match of event.matches) {
    // Replays need their own identity to avoid merging with the original match.
    if (match.replayOf != null) {
      continue;
    }

    const labelMatch = /^Practice\s+(\d+)$/.exec(match.label);

    if (!labelMatch) {
      continue;
    }

    const matchNumber = Number(labelMatch[1]);

    if (matchNumber < 1 || matchNumber > 32767) {
      continue;
    }

    const teams = [...(match.redTeams ?? []), ...(match.blueTeams ?? [])];

    const teamNumbers: number[] = [];

    for (const team of teams) {
      if (team === null || !/^\d+$/.test(team)) {
        continue;
      }

      const teamNumber = Number(team);

      if (
        !Number.isInteger(teamNumber) ||
        teamNumber <= 0 ||
        teamNumber > 2147483647
      ) {
        continue;
      }
      if (!teamNumbers.includes(teamNumber)) {
        teamNumbers.push(teamNumber);
      }
    }

    if (teamNumbers.length === 0) {
      continue;
    }

    practiceMatches.push({
      matchNumber: matchNumber,
      teamNumbers: teamNumbers,
    });
  }
  return practiceMatches;
};
