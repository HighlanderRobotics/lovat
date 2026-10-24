import type { ScouterSchedule } from "../lovatAPI/getScouterSchedule";
import type { ScoutReportMeta } from "../models/ScoutReportMeta";
import { MatchIdentity, MatchType } from "../models/match";

const phaseOrder = {
  [MatchType.Practice]: 0,
  [MatchType.Qualifier]: 1,
  [MatchType.Elimination]: 2,
};

function compareMatches(a: MatchIdentity, b: MatchIdentity) {
  return (
    phaseOrder[a.matchType] - phaseOrder[b.matchType] ||
    a.matchNumber - b.matchNumber
  );
}

export function nextScouterAssignment(
  schedule: ScouterSchedule | null | undefined,
  completed: ScoutReportMeta,
  history: readonly { meta: ScoutReportMeta }[],
): ScoutReportMeta | null {
  if (schedule?.tournamentKey !== completed.matchIdentity.tournamentKey)
    return null;

  const matches = schedule.data
    .filter(
      (match) =>
        match.matchIdentity.tournamentKey === schedule.tournamentKey &&
        match.scouters[completed.scouterUUID] &&
        compareMatches(match.matchIdentity, completed.matchIdentity) > 0,
    )
    .sort((a, b) => compareMatches(a.matchIdentity, b.matchIdentity));

  for (const match of matches) {
    const assignment = match.scouters[completed.scouterUUID];
    const alreadyScouted = history.some(
      ({ meta }) =>
        meta.scouterUUID === completed.scouterUUID &&
        meta.teamNumber === assignment.teamNumber &&
        meta.matchIdentity.tournamentKey === schedule.tournamentKey &&
        compareMatches(meta.matchIdentity, match.matchIdentity) === 0,
    );
    if (!alreadyScouted)
      return {
        scouterUUID: completed.scouterUUID,
        matchIdentity: match.matchIdentity,
        teamNumber: assignment.teamNumber,
        allianceColor: assignment.allianceColor,
      };
  }
  return null;
}
