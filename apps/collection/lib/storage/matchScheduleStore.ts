import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage } from "./zustandStorage";
import {
  useScouterStore,
  useTeamStore,
  useTournamentStore,
} from "./userStores";
import { useUrlPrefix } from "../lovatAPI/lovatAPI";
import { getMatchSchedule, MatchSchedule } from "../lovatAPI/getMatchSchedule";
import { useConnectivityStore } from "../network/connectivity";

type Entry = { data: MatchSchedule; timestamp: number };
type ScheduleStore = {
  schedules: Record<string, Entry>;
  data: MatchSchedule | null;
  timestamp: number | null;
  selectCurrentSchedule: () => void;
  fetchData: () => Promise<void>;
  clear: () => void;
};
export function currentScheduleScope() {
  const tournament = useTournamentStore.getState().value;
  const team = useTeamStore.getState();
  const scouter = useScouterStore.getState().value;
  const api = useUrlPrefix.getState().getUrlPrefix();
  if (!tournament || !team.number || !scouter?.uuid || !api) return null;
  return {
    tournamentKey: tournament.key,
    key: JSON.stringify([api, team.number, scouter.uuid, tournament.key]),
  };
}
const pending = new Map<string, Promise<void>>();
let generation = 0;
export const useMatchScheduleStore = create(
  persist<ScheduleStore>(
    (set, get) => ({
      schedules: {},
      data: null,
      timestamp: null,
      selectCurrentSchedule: () => {
        const scope = currentScheduleScope();
        const cached = scope ? get().schedules[scope.key] : undefined;
        set({
          data: cached?.data ?? null,
          timestamp: cached?.timestamp ?? null,
        });
      },
      clear: () => {
        generation++;
        pending.clear();
        set({ schedules: {}, data: null, timestamp: null });
      },
      fetchData: async () => {
        get().selectCurrentSchedule();
        const scope = currentScheduleScope();
        if (!scope || useConnectivityStore.getState().status === "offline")
          return;
        const existing = pending.get(scope.key);
        if (existing) return existing;
        const startedGeneration = generation;
        const request = (async () => {
          const data = await getMatchSchedule(scope.tournamentKey);
          if (generation !== startedGeneration) return;
          const entry = { data, timestamp: Date.now() };
          set({ schedules: { ...get().schedules, [scope.key]: entry } });
          if (currentScheduleScope()?.key === scope.key)
            get().selectCurrentSchedule();
        })();
        pending.set(scope.key, request);
        try {
          await request;
        } finally {
          if (pending.get(scope.key) === request) pending.delete(scope.key);
        }
      },
    }),
    {
      name: "fullMatchSchedules.v1",
      storage,
      partialize: (state) => ({ schedules: state.schedules }) as ScheduleStore,
      onRehydrateStorage: () => (state) => state?.selectCurrentSchedule(),
    },
  ),
);
