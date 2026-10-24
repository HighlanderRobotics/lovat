import { ScoutReportMeta } from "../models/ScoutReportMeta";
import {
  ChargedUpEvent,
  ChargedUpReport,
  PostMatchData,
  GamePiece,
} from "./ChargedUp";
export enum GamePhase {
  Auto,
  Teleop,
  Endgame,
}
export type ReportState = PostMatchData & {
  uuid?: string;
  meta?: ScoutReportMeta;
  startTimestamp?: Date;
  startPosition?: number;
  preloadedPiece: GamePiece | null;
  setPreloadedPiece: (piece: GamePiece | null) => void;
  startHold: (location: "OPPONENT_ZONE" | "OPPONENT_STATION") => void;
  stopHold: (location?: "OPPONENT_ZONE" | "OPPONENT_STATION") => void;
  fieldPieces: ("CONE" | "CUBE" | "UNKNOWN")[];
  setFieldPiece: (index: number) => void;
  events: ChargedUpEvent[];
  gamePhase: GamePhase;
  scoutMatch: (meta: ScoutReportMeta) => void;
  restartMatch: () => void;
  initializeMatchTimestamp: () => void;
  setStartPosition: (value: number) => void;
  setGamePhase: (value: GamePhase) => void;
  setPostMatch: (value: Partial<PostMatchData>) => void;
  addEvent: (event: Omit<ChargedUpEvent, "time">) => boolean;
  undoEvent: () => void;
  exportScoutReport: () => ChargedUpReport | null;
  reset: () => void;
};
