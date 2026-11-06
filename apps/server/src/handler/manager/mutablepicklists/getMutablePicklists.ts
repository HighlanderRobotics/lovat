import { Response } from "express";
import prismaClient from "../../../prismaClient.js";
import { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";

export const getMutablePicklists = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  {
    if (req.user.teamNumber === null) {
      res.status(403).send({
        code: "TEAM_REQUIRED",
        displayError:
          "Not authortized to get mutable picklists because your not on a team",
      });
      return;
    }
    const user = req.user;
    const rows = await prismaClient.mutablePicklist.findMany({
      where: {
        author: {
          teamNumber: user.teamNumber,
        },
      },
      select: {
        name: true,
        uuid: true,
        tournamentKey: true,
        author: {
          select: {
            username: true,
          },
        },
      },
    });
    res.status(200).send(rows);
  }
};
