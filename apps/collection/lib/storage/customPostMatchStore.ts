import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { customPostMatchQuestionsSchema } from "../collection/CustomPostMatch";
import { get as apiGet, useUrlPrefix } from "../lovatAPI/lovatAPI";
import { useConnectivityStore } from "../network/connectivity";
import { useTeamStore } from "./userStores";
import { storage } from "./zustandStorage";

const responseSchema = z.object({
  teamNumber: z.number().int(),
  customPostMatch: customPostMatchQuestionsSchema,
});
type Entry = { questions: string[]; timestamp: number };
type Store = {
  cache: Record<string, Entry>;
  getQuestions: () => string[];
  fetchData: () => Promise<void>;
  clear: () => void;
};
function scope() {
  const team = useTeamStore.getState();
  const api = useUrlPrefix.getState().getUrlPrefix();
  return team.number && team.code && api
    ? {
        key: JSON.stringify([api, team.number]),
        teamNumber: team.number,
        code: team.code,
      }
    : null;
}
const pending = new Map<string, Promise<void>>();
let generation = 0;
export const useCustomPostMatchStore = create(
  persist<Store>(
    (set, get) => ({
      cache: {},
      getQuestions: () => {
        const current = scope();
        return current ? [...(get().cache[current.key]?.questions ?? [])] : [];
      },
      clear: () => {
        generation++;
        pending.clear();
        set({ cache: {} });
      },
      fetchData: async () => {
        const current = scope();
        if (!current || useConnectivityStore.getState().status === "offline")
          return;
        const pendingKey = JSON.stringify([current.key, current.code]);
        const existing = pending.get(pendingKey);
        if (existing) return existing;
        const startedGeneration = generation;
        const request = (async () => {
          const response = await apiGet("/v1/manager/custom-post-match");
          if (!response.ok)
            throw new Error("Could not load team custom questions");
          const data = responseSchema.parse(await response.json());
          if (data.teamNumber !== current.teamNumber)
            throw new Error("Unexpected team for custom questions");
          if (
            generation !== startedGeneration ||
            scope()?.key !== current.key ||
            scope()?.code !== current.code
          )
            return;
          set({
            cache: {
              ...get().cache,
              [current.key]: {
                questions: data.customPostMatch,
                timestamp: Date.now(),
              },
            },
          });
        })();
        pending.set(pendingKey, request);
        try {
          await request;
        } finally {
          if (pending.get(pendingKey) === request) pending.delete(pendingKey);
        }
      },
    }),
    {
      name: "customPostMatchQuestions.v1",
      storage,
      partialize: (state) => ({ cache: state.cache }) as Store,
    },
  ),
);
