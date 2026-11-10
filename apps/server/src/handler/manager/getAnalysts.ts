import { Response } from "express";
import prismaClient from "../../prismaClient.js";
import { AuthenticatedRequest } from "../../lib/middleware/requireAuth.js";
import { UserRole } from "@lovat/db";
import { AppError } from "../../lib/errors.js";

export const getAnalysts = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  if (req.user.teamNumber === null) {
    throw new AppError("Not affiliated with a team", 404, "TEAM_NOT_FOUND");
  }

  if (req.user.role !== "SCOUTING_LEAD") {
    throw new AppError("Not a scouting lead", 403, "SCOUTING_LEAD_REQUIRED");
  }

  const analystsOnTeam = await prismaClient.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
    },
    where: {
      teamNumber: req.user.teamNumber,
      role: UserRole.ANALYST,
    },
  });

  res.status(200).send(analystsOnTeam);
};
