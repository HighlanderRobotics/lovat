export type ScouterIdentity = {
  uuid: string;
};

export type PersistedScouterStatus =
  "missing" | "valid" | "invalid" | "unverified";

export type StartupRoute =
  "/home" | "/onboarding" | "/onboarding/name" | "/onboarding/tournaments";

export function shouldFetchScouterServices(
  scouter: ScouterIdentity | null | undefined,
): boolean {
  return Boolean(scouter?.uuid);
}

export function validatePersistedScouter(
  scouter: ScouterIdentity | null | undefined,
  teamScouters: ScouterIdentity[] | null | undefined,
): PersistedScouterStatus {
  if (!scouter?.uuid) {
    return "missing";
  }

  if (!teamScouters) {
    return "unverified";
  }

  return teamScouters.some((teamScouter) => teamScouter.uuid === scouter.uuid)
    ? "valid"
    : "invalid";
}

export type StartupServiceFetches = {
  fetchTeamScouters: () => Promise<void>;
  fetchTournaments: () => Promise<void>;
  fetchScouterSchedule: () => Promise<void>;
  fetchMatchSchedule: () => Promise<void>;
  getTeamScouters: () => ScouterIdentity[] | null | undefined;
};

export type StartupServiceResult = {
  invalidScouter: boolean;
  error: unknown;
};

export async function loadScouterServices(
  scouter: ScouterIdentity | null | undefined,
  fetches: StartupServiceFetches,
): Promise<StartupServiceResult> {
  if (!shouldFetchScouterServices(scouter)) {
    return { invalidScouter: false, error: null };
  }

  let teamScouterFetchError: unknown = null;
  try {
    await fetches.fetchTeamScouters();
  } catch (error) {
    teamScouterFetchError = error;
  }

  if (
    !teamScouterFetchError &&
    validatePersistedScouter(scouter, fetches.getTeamScouters()) === "invalid"
  ) {
    return { invalidScouter: true, error: null };
  }

  // A missing scouter schedule must not stop the official schedule refresh.
  const results = await Promise.allSettled([
    fetches.fetchTournaments(),
    fetches.fetchScouterSchedule(),
    fetches.fetchMatchSchedule(),
  ]);

  if (teamScouterFetchError) {
    return { invalidScouter: false, error: teamScouterFetchError };
  }

  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") {
    return { invalidScouter: false, error: failure.reason };
  }

  return { invalidScouter: false, error: null };
}

export function resolveStartupRoute({
  onboardingComplete,
  teamCode,
  scouter,
  tournament,
}: {
  onboardingComplete: boolean;
  teamCode: string;
  scouter: ScouterIdentity | null;
  tournament: unknown;
}): StartupRoute {
  if (onboardingComplete && scouter && tournament) {
    return "/home";
  }

  if (!teamCode) {
    return "/onboarding";
  }

  if (!scouter) {
    return "/onboarding/name";
  }

  return "/onboarding/tournaments";
}
