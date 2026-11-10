import { Response } from "express";
import prismaClient from "../../prismaClient.js";
import { AuthenticatedRequest } from "../../lib/middleware/requireAuth.js";
import { AppError } from "../../lib/errors.js";

export const getTeamCode = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const user = req.user;

  if (user.role !== "SCOUTING_LEAD") {
    throw new AppError(
      "Not authorized to get the team code",
      403,
      "SCOUTING_LEAD_REQUIRED",
    );
  }

  if (user.teamNumber === null) {
    throw new AppError("Not affiliated with a team", 404, "TEAM_NOT_FOUND");
  }

  const row = await prismaClient.registeredTeam.findUnique({
    where: {
      number: user.teamNumber,
    },
  });

  if (row === null) {
    throw new AppError("Registered team not found", 404, "TEAM_NOT_FOUND");
  }

  if (!row.teamApproved || !row.emailVerified) {
    throw new AppError("team email not approved", 400, "TEAM_NOT_APPROVED");
  }

  res.status(200).send(row.code);
};
