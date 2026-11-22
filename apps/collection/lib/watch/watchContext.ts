import type { Scouter } from "../models/scouter";
import type { Tournament } from "../lovatAPI/getTournaments";
import type { HistoryEntry } from "../storage/historyStore";

type WatchState = {
  hydrated: boolean;
  onboardingComplete: boolean;
  trainingMode: boolean;
  team: { code: string; number: number | null };
  scouter: Pick<Scouter, "uuid" | "name" | "sourceTeamNumber"> | null;
  tournament: Pick<Tournament, "key" | "name"> | null;
  apiURL: string | undefined;
  history: Pick<HistoryEntry, "meta">[];
};

export function buildWatchContext(state: WatchState) {
  // An empty store during async hydration is not a sign-out.
  if (!state.hydrated) return null;

  const { team, scouter, tournament } = state;
  if (
    !state.onboardingComplete ||
    state.trainingMode ||
    !team.code ||
    !scouter ||
    !tournament ||
    scouter.sourceTeamNumber !== team.number
  ) {
    return { signedIn: false };
  }

  return {
    signedIn: true,
    apiURL: state.apiURL,
    teamCode: team.code,
    teamNumber: team.number,
    scouterUUID: scouter.uuid,
    scouterName: scouter.name,
    tournamentKey: tournament.key,
    tournamentName: tournament.name,
    completedMatches: state.history
      .filter(
        (entry) =>
          entry.meta.scouterUUID === scouter.uuid &&
          entry.meta.matchIdentity.matchType !== "PRACTICE" &&
          entry.meta.matchIdentity.tournamentKey === tournament.key,
      )
      .map((entry) => {
        const identity = entry.meta.matchIdentity;
        return `${identity.matchType === "QUALIFIER" ? 0 : 1}-${identity.matchNumber}`;
      }),
  };
}
