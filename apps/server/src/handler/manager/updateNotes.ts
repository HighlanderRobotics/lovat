import { Prisma } from "@lovat/db";
import { Response } from "express";
import prismaClient from "../../prismaClient.js";
import z from "zod";
import { AuthenticatedRequest } from "../../lib/middleware/requireAuth.js";
import { invalidateCache } from "../../lib/clearCache.js";

export const updateNotes = async (
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
        note: z.string(),
        uuid: z.string(),
      })
      .parse({
        note: req.body.note,
        uuid: req.params.uuid,
      });
    if (req.user.role !== "SCOUTING_LEAD" || req.user.teamNumber === null) {
      res.status(403).send("Not authorized to edit this note");
      return;
    }
    const row = await prismaClient.scoutReport.update({
      where: {
        uuid: req.params.uuid,
        scouter: {
          sourceTeamNumber: req.user.teamNumber,
        },
      },
      data: {
        notes: params.note,
      },
      include: {
        teamMatchData: true,
      },
    });
    await invalidateCache(
      row.teamMatchData.teamNumber,
      row.teamMatchData.tournamentKey,
    );

    res.status(200).send("Note updated");
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request parameters" });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(404).send("Report not found");
      return;
    }
    console.error(error);
    res.status(500).send("Internal server error");
  }
};
