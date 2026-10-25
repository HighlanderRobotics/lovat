import type { User } from "@lovat/db";
import z from "zod";
import {
  dataSourceRuleSchema,
  dataSourceRuleToPrismaFilter,
} from "./dataSourceRule.js";

export const scoutReportSourceFilter = (user: User) => {
  const sourceTeamRule = dataSourceRuleSchema(z.number()).parse(
    user.teamSourceRule,
  );
  const sourceTournamentRule = dataSourceRuleSchema(z.string()).parse(
    user.tournamentSourceRule,
  );
  return {
    scouter: {
      sourceTeamNumber: dataSourceRuleToPrismaFilter(sourceTeamRule),
    },
    teamMatchData: {
      tournamentKey: dataSourceRuleToPrismaFilter(sourceTournamentRule),
    },
  };
};
