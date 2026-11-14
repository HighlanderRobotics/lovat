import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import {
  liveActivities,
  NativeActivityStatus,
} from "../../modules/lovat-live-activities";
import { get, useUrlPrefix } from "../lovatAPI/lovatAPI";
import {
  useScouterStore,
  useTeamStore,
  useTournamentStore,
  useTrainingModeStore,
} from "../storage/userStores";
import { storage, waitForStoreHydration } from "../storage/zustandStorage";
import { ActivityState, activityPreview, activityStateSchema } from "./state";

export const useLiveActivitySettings = create(
  persist<{
    enabled: boolean;
    installationId: string;
  }>(() => ({ enabled: true, installationId: uuid() }), {
    name: "liveActivitySettings",
    storage,
  }),
);

export const useLiveActivityDebug = create<{
  mode: "live" | "waiting" | "onShift";
  error: string | null;
  backgroundReady: boolean | null;
  status: NativeActivityStatus | null;
  state: ActivityState | null;
  revision: number;
}>(() => ({
  mode: "live",
  error: null,
  backgroundReady: null,
  status: null,
  state: null,
  revision: 0,
}));

let pending: Promise<unknown> = Promise.resolve();
function serialize(task: () => Promise<void>) {
  pending = pending.catch(() => undefined).then(task);
  return pending;
}

export async function stopLiveActivities() {
  useLiveActivitySettings.setState({ enabled: false });
  await serialize(async () => {
    await liveActivities?.stop();
  });
}

export function LiveActivityConnection() {
  const scout = useScouterStore((state) => state.value?.uuid);
  const tournament = useTournamentStore((state) => state.value?.key);
  const code = useTeamStore((state) => state.code);
  const training = useTrainingModeStore((state) => state.value);
  const customUrl = useUrlPrefix((state) => state.urlPrefix);
  const enabled = useLiveActivitySettings((state) => state.enabled);
  const installationId = useLiveActivitySettings(
    (state) => state.installationId,
  );
  const mode = useLiveActivityDebug((state) => state.mode);
  const revision = useLiveActivityDebug((state) => state.revision);
  const generation = useRef(0);
  const previousMode = useRef(mode);

  useEffect(() => {
    if (!liveActivities) return;
    const native = liveActivities;
    const current = ++generation.current;
    const isCurrent = () => current === generation.current;
    let fetching = false;

    const refresh = () => {
      if (fetching || AppState.currentState !== "active") return;
      fetching = true;
      void serialize(async () => {
        try {
          await waitForStoreHydration(useLiveActivitySettings);
          if (!isCurrent()) return;
          useLiveActivityDebug.setState({ error: null });
          if (
            !enabled ||
            (mode === "live" && (!scout || !tournament || !code || training))
          ) {
            await native.stop();
            useLiveActivityDebug.setState({
              status: await native.status(),
              state: null,
            });
            return;
          }

          if (mode !== "live") {
            const state = activityPreview(mode);
            const status = await native.sync({}, JSON.stringify(state), true);
            if (isCurrent())
              useLiveActivityDebug.setState({
                state,
                status,
                backgroundReady: null,
              });
            return;
          }

          const response = await get(
            `/collection/live-activities/${encodeURIComponent(tournament!)}`,
          );
          if (!response.ok) {
            if (
              response.status === 401 ||
              response.status === 403 ||
              response.status === 404
            )
              await native.stop();
            throw new Error("Unable to refresh Live Activity assignments.");
          }
          const result = z
            .object({
              state: activityStateSchema.nullable(),
              backgroundReady: z.boolean(),
            })
            .parse(await response.json());
          if (!isCurrent()) return;
          const config = {
            installationId,
            scouterUuid: scout!,
            tournamentKey: tournament!,
            teamCode: code,
            baseUrl: useUrlPrefix.getState().getUrlPrefix().replace(/\/$/, ""),
          };
          const status = await native.sync(
            config,
            result.state ? JSON.stringify(result.state) : null,
            false,
          );
          if (isCurrent())
            useLiveActivityDebug.setState({
              state: result.state,
              status,
              backgroundReady: result.backgroundReady,
            });
        } catch (error) {
          if (isCurrent())
            useLiveActivityDebug.setState({
              error:
                error instanceof Error
                  ? error.message
                  : "Live Activity failed.",
            });
        } finally {
          fetching = false;
        }
      });
    };

    // Retire the real push registration when entering previews, but update the
    // same preview activity when switching layouts. Ending then immediately
    // requesting another can leave ActivityKit displaying the old layout.
    const enteringPreview = mode !== "live" && previousMode.current === "live";
    previousMode.current = mode;
    if (enteringPreview || (mode === "live" && revision > 0)) {
      void serialize(async () => {
        if (isCurrent()) await native.stop();
      });
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      generation.current++;
      clearInterval(timer);
      listener.remove();
    };
  }, [
    scout,
    tournament,
    code,
    training,
    customUrl,
    enabled,
    installationId,
    mode,
    revision,
  ]);

  return null;
}
