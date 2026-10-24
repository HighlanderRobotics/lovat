import { ScoutReportMeta } from "../models/ScoutReportMeta";
import { ChargedUpEvent, ChargedUpReport, PostMatchData } from "./ChargedUp";
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
  addEvent: (event: Omit<ChargedUpEvent, "time">) => void;
  undoEvent: () => void;
  exportScoutReport: () => ChargedUpReport | null;
  reset: () => void;
};
