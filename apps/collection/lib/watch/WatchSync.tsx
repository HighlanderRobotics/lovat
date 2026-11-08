import { buildWatchContext } from "./watchContext";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import {
  useOnboardingCompleteStore,
  useScouterStore,
  useTeamStore,
  useTournamentStore,
  useTrainingModeStore,
} from "../storage/userStores";
import { useUrlPrefix } from "../lovatAPI/lovatAPI";
import { useHistoryStore } from "../storage/historyStore";

// Optional so Android, web, and Expo Go continue to work without a native watch module.
const bridge =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<{
        syncContext: (json: string) => Promise<void>;
      }>("LovatWatch")
    : null;

export function WatchSync() {
  useEffect(() => {
    if (!bridge) return;

    const stores = [
      useTeamStore,
      useScouterStore,
      useTournamentStore,
      useOnboardingCompleteStore,
      useTrainingModeStore,
      useUrlPrefix,
      useHistoryStore,
    ];
    let stopped = false;
    let queue = Promise.resolve();
    let previous = "";
    let lastRevision = 0;
    const sync = () => {
      if (stopped) return;
      const context = buildWatchContext({
        hydrated: stores.every((store) => store.persist.hasHydrated()),
        onboardingComplete: useOnboardingCompleteStore.getState().value,
        trainingMode: useTrainingModeStore.getState().value,
        team: useTeamStore.getState(),
        scouter: useScouterStore.getState().value,
        tournament: useTournamentStore.getState().value,
        apiURL: useUrlPrefix.getState().getUrlPrefix(),
        history: useHistoryStore.getState().history,
      });
      if (!context) return;

      const value = JSON.stringify(context);
      if (previous === value) return;
      previous = value;
      lastRevision = Math.max(Date.now(), lastRevision + 1);
      const json = JSON.stringify({ ...context, revision: lastRevision });
      // Preserve update order when reset changes several stores together.
      queue = queue
        .then(() => bridge.syncContext(json))
        .catch(() => {
          previous = "";
          // Never log the payload: it contains a team credential.
          console.warn("Unable to sync Collection with Apple Watch");
        });
    };

    const unsubscribe = stores.flatMap((store) => [
      store.subscribe(sync),
      store.persist.onFinishHydration(sync),
    ]);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        previous = "";
        sync();
      }
    });
    sync();
    return () => {
      appState.remove();
      stopped = true;
      unsubscribe.forEach((stop) => stop());
    };
  }, []);

  return null;
}
