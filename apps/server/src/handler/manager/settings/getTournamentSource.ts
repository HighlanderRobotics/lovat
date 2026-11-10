import { Response } from "express";
import { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";
import {
  parseStoredSourceRule,
  dataSourceRuleToArray,
} from "../../analysis/dataSourceRule.js";
import { allTournaments } from "../../analysis/analysisConstants.js";
import z from "zod";

export const getTournamentSource = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  {
    res
      .status(200)
      .send(
        dataSourceRuleToArray(
          parseStoredSourceRule(z.string(), req.user.tournamentSourceRule),
          await allTournaments,
        ),
      );
  }
};
