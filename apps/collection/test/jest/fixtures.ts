import type { ScoutReport } from "../../lib/collection/ScoutReport";
import type { ScoutReportMeta } from "../../lib/models/ScoutReportMeta";
import { MatchType } from "../../lib/models/match";
import { AllianceColor } from "../../lib/models/AllianceColor";

// Invented, app-local fixtures. No production reports, notes, or credentials.
export const meta: ScoutReportMeta = {
  scouterUUID: "22222222-2222-4222-8222-222222222222",
  teamNumber: 1234,
  allianceColor: AllianceColor.Red,
  matchIdentity: {
    tournamentKey: "2026test",
    matchType: MatchType.Qualifier,
    matchNumber: 1,
  },
};
export function makeReport(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    appVersion: "26.1.0",
    uuid: "11111111-1111-4111-8111-111111111111",
    tournamentKey: "2026test",
    matchType: "QUALIFICATION",
    matchNumber: 1,
    startTime: 1000,
    teamNumber: 1234,
    notes: "Synthetic note",
    robotBrokeDescription: null,
    robotRoles: [],
    mobility: "NONE",
    disrupts: false,
    accuracy: null,
    autoClimb: "NOT_ATTEMPTED",
    intakeType: "NEITHER",
    feederTypes: [],
    beached: "NEITHER",
    defenseEffectiveness: 2,
    scoresWhileMoving: false,
    endgameClimb: "NOT_ATTEMPTED",
    driverAbility: 2,
    scouterUuid: meta.scouterUUID,
    events: [],
    ...overrides,
  };
}
