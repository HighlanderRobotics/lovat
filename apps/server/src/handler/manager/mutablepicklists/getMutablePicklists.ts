import { Response } from "express";
import prismaClient from "../../../prismaClient.js";
import { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";

export const getMutablePicklists = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  {
    if (req.user.teamNumber === null) {
      const message =
        "Not authortized to get mutable picklists because your not on a team";
      res
        .status(403)
        .send(
          req.headers["x-lovat-error-format"] === "json-v1"
            ? { code: "TEAM_REQUIRED", displayError: message }
            : message,
        );
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
