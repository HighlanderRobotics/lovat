import type { User } from "@lovat/db";
import z from "zod";
import {
  parseStoredSourceRule,
  dataSourceRuleToPrismaFilter,
} from "./dataSourceRule.js";

export const scoutReportSourceFilter = (user: User) => {
  const sourceTeamRule = parseStoredSourceRule(z.number(), user.teamSourceRule);
  const sourceTournamentRule = parseStoredSourceRule(
    z.string(),
    user.tournamentSourceRule,
  );
  return {
    training: false,
    scouter: {
      sourceTeamNumber: dataSourceRuleToPrismaFilter(sourceTeamRule),
    },
    teamMatchData: {
      tournamentKey: dataSourceRuleToPrismaFilter(sourceTournamentRule),
    },
  };
};
