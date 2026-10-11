import type { Request, Response } from "express";
import prismaClient from "../../prismaClient.js";

export async function getSeason(req: Request, res: Response): Promise<void> {
  const value = req.params.year;

  if (
    typeof value !== "string" ||
    !/^\d{4}$/.test(value) ||
    Number(value) < 1992
  ) {
    res.status(400).json({ error: "Invalid season year" });
    return;
  }

  try {
    const season = await prismaClient.season.findUnique({
      where: { year: Number(value) },
      select: {
        year: true,
        gameName: true,
        districtSeasons: {
          orderBy: { name: "asc" },
          select: { key: true, abbreviation: true, name: true },
        },
        tournaments: {
          where: { districtSeasonKey: null },
          orderBy: [{ startDate: "asc" }, { key: "asc" }],
          select: {
            key: true,
            parentTournamentKey: true,
            name: true,
            location: true,
            startDate: true,
            endDate: true,
            week: true,
            eventType: true,
          },
        },
      },
    });

    if (!season) {
      res.status(404).json({ error: "Season not imported yet" });
      return;
    }

    res.set("Cache-Control", "public, max-age=300");
    res.json(season);
  } catch {
    res.status(503).json({ error: "Season data is temporarily unavailable" });
  }
}
