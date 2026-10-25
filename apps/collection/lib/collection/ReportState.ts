import { ScoutReportMeta } from "../models/ScoutReportMeta";
import { CustomPostMatchAnswer } from "./CustomPostMatch";
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
  scoutMatch: (meta: ScoutReportMeta, customQuestions?: string[]) => void;
  customPostMatch: CustomPostMatchAnswer[];
  setCustomPostMatchAnswer: (index: number, answer: string) => void;
  restartMatch: () => void;
  initializeMatchTimestamp: () => void;
  setStartPosition: (value: number) => void;
  setGamePhase: (value: GamePhase) => void;
  setPostMatch: (value: Partial<PostMatchData>) => void;
  postMatchPrepared: boolean;
  preparePostMatch: () => void;
  addEvent: (event: Omit<ChargedUpEvent, "time">) => boolean;
  undoEvent: () => void;
  exportScoutReport: () => ChargedUpReport | null;
  reset: () => void;
};
