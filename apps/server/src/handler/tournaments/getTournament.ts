import type { Request, Response } from "express";
import prismaClient from "../../prismaClient.js";

export async function getTournament(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    // Public official data only: never include scouting reports or team strategy.
    const tournament = await prismaClient.tournament.findUnique({
      where: { key: "2026cancmp" },
      select: {
        key: true,
        name: true,
        location: true,
        startDate: true,
        endDate: true,
        timezone: true,
        officialDataUpdatedAt: true,
        teams: {
          orderBy: { teamNumber: "asc" },
          select: { team: { select: { number: true, name: true } } },
        },
        matches: {
          orderBy: [{ displayOrder: "asc" }, { key: "asc" }],
          select: {
            key: true,
            competitionLevel: true,
            setNumber: true,
            matchNumber: true,
            displayOrder: true,
            scheduledTime: true,
            predictedTime: true,
            actualTime: true,
            status: true,
            winningAlliance: true,
            alliances: {
              orderBy: { color: "asc" },
              select: { color: true, score: true },
            },
            teamSlots: {
              orderBy: [{ alliance: "asc" }, { station: "asc" }],
              select: {
                teamNumber: true,
                alliance: true,
                station: true,
                surrogate: true,
                disqualified: true,
              },
            },
          },
        },
        gaps: {
          orderBy: { startTime: "asc" },
          select: {
            afterMatchKey: true,
            beforeMatchKey: true,
            type: true,
            timingSource: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!tournament) {
      res.status(404).json({ error: "Tournament not imported yet" });
      return;
    }

    res.set("Cache-Control", "public, max-age=30");
    res.json(tournament);
  } catch {
    res
      .status(503)
      .json({ error: "Tournament data is temporarily unavailable" });
  }
}
