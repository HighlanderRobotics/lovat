import { create } from "zustand";
import { v4 } from "uuid";
import Constants from "expo-constants";
import { MatchType } from "../models/match";
import { GamePhase, ReportState } from "./ReportState";
import {
  chargedUpReportSchema,
  eventSchema,
  initialPostMatch,
  MATCH_END_SECONDS,
} from "./ChargedUp";
const initialState = {
  ...initialPostMatch,
  fieldPieces: ["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"] as (
    | "CONE"
    | "CUBE"
    | "UNKNOWN"
  )[],
  events: [],
  gamePhase: GamePhase.Auto,
  startTimestamp: undefined,
  startPosition: undefined,
};
export const useReportStateStore = create<ReportState>((set, get) => ({
  ...initialState,
  scoutMatch: (meta) => set({ ...initialState, meta, uuid: v4() }),
  restartMatch: () => set({ ...initialState, uuid: v4() }),
  initializeMatchTimestamp: () => {
    if (get().startPosition !== undefined && !get().startTimestamp)
      set({ startTimestamp: new Date() });
  },
  setStartPosition: (value) => {
    if (!get().startTimestamp)
      set({ startPosition: Math.round(Math.max(0, Math.min(100, value))) });
  },
  setFieldPiece: (index) => {
    if (get().startTimestamp) return;
    set({
      fieldPieces: get().fieldPieces.map((p, i) =>
        i !== index
          ? p
          : p === "UNKNOWN"
            ? "CONE"
            : p === "CONE"
              ? "CUBE"
              : "UNKNOWN",
      ),
    });
  },
  setGamePhase: (gamePhase) => set({ gamePhase }),
  setPostMatch: (value) => set(value),
  addEvent: (event) => {
    const start = get().startTimestamp;
    if (!start) return;
    const time = Math.max(
      0,
      Math.min(MATCH_END_SECONDS, (Date.now() - start.getTime()) / 1000),
    );
    set({ events: [...get().events, eventSchema.parse({ ...event, time })] });
  },
  undoEvent: () => set({ events: get().events.slice(0, -1) }),
  exportScoutReport: () => {
    const state = get();
    if (
      !state.meta ||
      !state.uuid ||
      !state.startTimestamp ||
      state.startPosition === undefined
    )
      return null;
    const { meta } = state;
    return chargedUpReportSchema.parse({
      ...Object.fromEntries(
        Object.keys(initialPostMatch).map((key) => [
          key,
          state[key as keyof typeof initialPostMatch],
        ]),
      ),
      fieldPieces: state.fieldPieces,
      gameYear: 2023,
      appVersion: Constants.expoConfig?.version,
      uuid: state.uuid,
      tournamentKey: meta.matchIdentity.tournamentKey,
      matchNumber: meta.matchIdentity.matchNumber,
      matchType:
        meta.matchIdentity.matchType === MatchType.Practice
          ? "PRACTICE"
          : meta.matchIdentity.matchType === MatchType.Elimination
            ? "ELIMINATION"
            : "QUALIFICATION",
      startTime: state.startTimestamp.getTime(),
      teamNumber: meta.teamNumber,
      scouterUuid: meta.scouterUUID,
      events: [
        {
          time: 0,
          action: "START_POSITION",
          location: "START_POSITION",
          position: state.startPosition,
        },
        ...state.events,
      ],
    });
  },
  reset: () => set({ ...initialState, uuid: undefined, meta: undefined }),
}));
