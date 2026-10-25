import { Response } from "express";
import prismaClient from "../../../prismaClient.js";
import z from "zod";
import { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";
import { Prisma, UserRole } from "@lovat/db";

export const archiveScouter = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (req.tokenType === "apiKey") {
      res
        .status(403)
        .json({ error: "This action cannot be performed using an API key" });
      return;
    }

    const params = z
      .object({
        uuid: z.string(),
      })
      .parse(req.params);

    if (
      req.user.role !== UserRole.SCOUTING_LEAD ||
      req.user.teamNumber === null
    ) {
      res
        .status(403)
        .send("You need to be a scouting lead to archive scouters");
      return;
    }

    await prismaClient.scouter.update({
      where: {
        uuid: params.uuid,
        sourceTeamNumber: req.user.teamNumber,
      },
      data: {
        archived: true,
      },
    });
    res.status(200).send("done archiving scouter");
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request parameters" });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(404).json({ error: "Scouter not found" });
      return;
    }
    console.error(error);
    res
      .status(500)
      .send({ error: "Internal server error", displayError: "Error" });
  }
};
