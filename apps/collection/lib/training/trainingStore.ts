import { create } from "zustand";

export type TrainingSnapshot = {
  uuid: string;
  status: string;
  serverTime: number;
  startedAt: number | null;
  endedAt: number | null;
  video: {
    teamNumber: number;
    tournamentKey: string;
    matchType: string;
    matchNumber: number;
    alliance: string;
    durationSeconds: number;
  };
  participants: {
    uuid: string;
    ready: boolean;
    status: string;
    score: { overallScore: number } | null;
  }[];
};

type TrainingState = {
  credentials: {
    sessionUuid: string;
    attemptUuid: string;
    token: string;
    reportUuid: string;
  } | null;
  snapshot: TrainingSnapshot | null;
  connected: boolean;
  error: string | null;
  set: (value: Partial<Omit<TrainingState, "set" | "clear">>) => void;
  clear: () => void;
};
export const useTrainingSessionStore = create<TrainingState>((set) => ({
  credentials: null,
  snapshot: null,
  connected: false,
  error: null,
  set: (value) => set(value),
  clear: () =>
    set({ credentials: null, snapshot: null, connected: false, error: null }),
}));
