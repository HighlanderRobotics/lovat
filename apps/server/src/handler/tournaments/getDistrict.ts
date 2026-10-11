import type { Request, Response } from "express";
import prismaClient from "../../prismaClient.js";

export async function getDistrict(req: Request, res: Response): Promise<void> {
  const key = req.params.key;

  if (typeof key !== "string" || !/^[0-9]{4}[a-z0-9]+$/.test(key)) {
    res.status(400).json({ error: "Invalid district key" });
    return;
  }

  try {
    const district = await prismaClient.districtSeason.findUnique({
      where: { key },
      select: {
        key: true,
        seasonYear: true,
        name: true,
        abbreviation: true,
        tournaments: {
          orderBy: [{ startDate: "asc" }, { key: "asc" }],
          select: {
            key: true,
            parentTournamentKey: true,
            week: true,
            eventType: true,
            name: true,
            location: true,
            startDate: true,
            endDate: true,
          },
        },
        teamSeasons: {
          orderBy: { teamNumber: "asc" },
          select: {
            teamNumber: true,
            name: true,
            city: true,
            stateProvince: true,
          },
        },
      },
    });

    if (!district) {
      res.status(404).json({ error: "District not imported yet" });
      return;
    }

    res.set("Cache-Control", "public, max-age=300");
    res.json(district);
  } catch {
    res.status(503).json({ error: "District data is temporarily unavailable" });
  }
}
