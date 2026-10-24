import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GenericStore, storage } from "./storage/zustandStorage";
import {
  getScouterSchedule,
  ScouterSchedule,
} from "./lovatAPI/getScouterSchedule";
import { Scouter } from "./models/scouter";
import { getTeamScouters } from "./lovatAPI/getTeamScouters";
import { getTournaments, Tournament } from "./lovatAPI/getTournaments";
import { useMatchScheduleStore } from "./storage/matchScheduleStore";
import { useConnectivityStore } from "./network/connectivity";
export { useMatchScheduleStore } from "./storage/matchScheduleStore";

export function getServiceLoader() {
  const fetchScouterSchedule =
    useScouterScheduleStore.getInitialState().fetchData;
  const fetchTeamScouters = useTeamScoutersStore.getInitialState().fetchData;
  const fetchTournaments = useTournamentsStore.getInitialState().fetchData;
  const fetchMatchSchedule = useMatchScheduleStore.getInitialState().fetchData;
  const setServicesLoading = useServicesLoadingStore.getInitialState().setValue;
  const setServiceError = useServiceErrorStore.getInitialState().setValue;

  return async () => {
    useMatchScheduleStore.getState().selectCurrentSchedule();
    if (useConnectivityStore.getState().status === "offline") return;
    let error: string | null = null;
    try {
      setServicesLoading(true);
      // A missing scouter schedule must not stop the official schedule refresh.
      const results = await Promise.allSettled([
        fetchTournaments(),
        fetchTeamScouters(),
        fetchScouterSchedule(),
        fetchMatchSchedule(),
      ]);
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    } catch (e) {
      console.error(e);
      error = JSON.stringify(e);
    } finally {
      setServicesLoading(false);
    }
    setServiceError(error);
  };
}

export const useServicesLoadingStore = create<GenericStore<boolean>>((set) => ({
  value: false,
  setValue: (value) => set({ value: value }),
}));

export const useServiceErrorStore = create<GenericStore<string | null>>(
  (set) => ({
    value: null,
    setValue: (value) => set({ value }),
  }),
);

type ServiceStore<T> = {
  data: T;
  timestamp: number | null;
  fetchData: () => Promise<void>;
};

export function createGenericServiceStore<T>(
  fetchFn: () => Promise<T>,
  name: string,
) {
  return create(
    persist<ServiceStore<T | null>>(
      (set) => ({
        data: null,
        timestamp: null,
        fetchData: async () => {
          const data = await fetchFn();
          const timestamp = Date.now();
          set({
            data: data,
            timestamp,
          });
        },
      }),
      {
        name: name,
        storage: storage,
      },
    ),
  );
}

export const useScouterScheduleStore = createGenericServiceStore<
  ScouterSchedule | undefined
>(getScouterSchedule, "scouterScheduleStore");

export const useTeamScoutersStore = createGenericServiceStore<Scouter[]>(
  getTeamScouters,
  "teamScoutersStore",
);

export const useTournamentsStore = createGenericServiceStore<Tournament[]>(
  getTournaments,
  "tournamentsListStore",
);
