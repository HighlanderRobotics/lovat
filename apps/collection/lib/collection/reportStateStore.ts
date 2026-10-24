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
  activeActivity,
  canRecordEvent,
  GamePiece,
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
  preloadedPiece: null as GamePiece | null,
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
  setPreloadedPiece: (preloadedPiece) => {
    if (!get().startTimestamp) set({ preloadedPiece });
  },
  startHold: (location) => {
    if (
      activeActivity(get().events) === "DEFENDING" &&
      get().events.at(-1)?.location === location
    )
      return;
    get().stopHold();
    get().addEvent({
      action: "START_DEFENDING",
      location,
    });
  },
  stopHold: (location) => {
    if (location && get().events.at(-1)?.location !== location) return;
    const activity = activeActivity(get().events);
    if (!activity) return;
    get().addEvent({
      action: activity === "DEFENDING" ? "STOP_DEFENDING" : "STOP_CAMPING",
      location: get().events.at(-1)!.location,
    });
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
    if (!start || !canRecordEvent(get().events, get().preloadedPiece, event))
      return false;
    const time = Math.max(
      0,
      Math.min(MATCH_END_SECONDS, (Date.now() - start.getTime()) / 1000),
    );
    set({ events: [...get().events, eventSchema.parse({ ...event, time })] });
    return true;
  },
  undoEvent: () => {
    const events = get().events;
    if (activeActivity(events)) return;
    const last = events.at(-1);
    if (last?.action === "STOP_DEFENDING" || last?.action === "STOP_CAMPING") {
      const startAction =
        last.action === "STOP_DEFENDING" ? "START_DEFENDING" : "START_CAMPING";
      const index = events.findLastIndex(
        (event) => event.action === startAction,
      );
      set({
        events: events.filter((_, i) => i !== index && i !== events.length - 1),
      });
    } else set({ events: events.slice(0, -1) });
  },
  exportScoutReport: () => {
    get().stopHold();
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
      preloadedPiece: state.preloadedPiece,
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
