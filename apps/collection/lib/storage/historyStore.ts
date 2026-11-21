import { ScoutReport, scoutReportSchema } from "../collection/ScoutReport";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import {
  ScoutReportMeta,
  scoutReportMetaSchema,
} from "../models/ScoutReportMeta";
import { z } from "zod";
import { createJSONStorage, persist } from "zustand/middleware";
import { migrateScoutReport } from "./scoutReportMigrations";
import { seasonHistoryStorage } from "./seasonHistoryStorage";

export const historyEntrySchema = z.object({
  scoutReport: scoutReportSchema,
  meta: scoutReportMetaSchema,
  uploaded: z.boolean(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

type HistoryStore = {
  history: HistoryEntry[];
  upsertMatch: (
    scoutReport: ScoutReport,
    uploaded: boolean,
    meta: ScoutReportMeta,
  ) => void;
  setMatchUploaded: (uuid: string) => void;
  deleteMatch: (uuid: string) => void;
};

export const useHistoryStore = create(
  persist<HistoryStore>(
    (set, get) => ({
      history: [],

      upsertMatch: (scoutReport, uploaded, meta) => {
        const history = get().history;

        if (
          history.some((entry) => entry.scoutReport.uuid === scoutReport.uuid)
        ) {
          const newHistory = history.filter(
            (entry) => entry.scoutReport.uuid !== scoutReport.uuid,
          );
          set({ history: [{ scoutReport, uploaded, meta }, ...newHistory] });
          return;
        }

        set({ history: [{ scoutReport, uploaded, meta }, ...history] });
      },

      setMatchUploaded: (uuid) => {
        set((state) => ({
          history: state.history.map((entry) => {
            if (entry.scoutReport.uuid === uuid) {
              return { ...entry, uploaded: true } as HistoryEntry;
            }
            return entry as HistoryEntry;
          }),
        }));
      },

      deleteMatch: (uuid) =>
        set((state) => ({
          history: state.history.filter(
            (entry) => entry.scoutReport.uuid !== uuid,
          ),
        })),
    }),
    {
      name: "historyStore2026",
      storage: createJSONStorage(() =>
        seasonHistoryStorage(
          AsyncStorage,
          (entry) => historyEntrySchema.safeParse(entry).success,
        ),
      ),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const migrated = state.history.map((entry) => ({
          ...entry,
          scoutReport: migrateScoutReport(entry.scoutReport),
        }));
        // Only update if migrations were applied
        if (
          migrated.some(
            (e, i) => e.scoutReport !== state.history[i].scoutReport,
          )
        ) {
          useHistoryStore.setState({ history: migrated });
        }
      },
    },
  ),
);
