import { Response } from "express";
import prismaClient from "../../../prismaClient.js";
import { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";
import { UserRole } from "@lovat/db";

export const getApiKeys = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = req.user;

    const whereClause =
      req.user.teamNumber === null || user.role !== UserRole.SCOUTING_LEAD
        ? { user: { id: req.user.id } }
        : { user: { teamNumber: req.user.teamNumber } };

    const apiKeys = await prismaClient.apiKey.findMany({
      where: whereClause,
      select: {
        uuid: true,
        name: true,
        createdAt: true,
        lastUsed: true,
        requests: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    res.status(200).json({ apiKeys });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
    console.error(error);
    return;
  }
};
