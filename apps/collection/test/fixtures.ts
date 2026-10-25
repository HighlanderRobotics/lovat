import { AllianceColor } from "../lib/models/AllianceColor";
import { MatchType } from "../lib/models/match";
import type { ScoutReportMeta } from "../lib/models/ScoutReportMeta";
import { useReportStateStore } from "../lib/collection/reportStateStore";
export const scout = {
  uuid: "scout",
  name: "Alex",
  sourceTeamNumber: 8033,
  strikes: 0,
  scouterReliability: 1,
};
export const tournament = {
  key: "2023test",
  name: "Test Regional",
  location: "Local",
  date: "2023-04-01",
};
export const meta: ScoutReportMeta = {
  scouterUUID: scout.uuid,
  teamNumber: 254,
  allianceColor: AllianceColor.Blue,
  matchIdentity: {
    tournamentKey: tournament.key,
    matchNumber: 1,
    matchType: MatchType.Qualifier,
  },
};
export function startReport(value: ScoutReportMeta = meta) {
  const state = useReportStateStore.getState();
  state.reset();
  state.scoutMatch(value);
  state.setStartPosition(50);
  state.initializeMatchTimestamp();
  return useReportStateStore.getState().exportScoutReport()!;
}
