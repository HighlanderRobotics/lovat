import type { Request, Response } from "express";
import prismaClient from "../../prismaClient.js";

export async function getMatch(req: Request, res: Response): Promise<void> {
  const key = req.params.key;

  if (
    typeof key !== "string" ||
    !/^[0-9]{4}[a-z0-9]+_(?:qm[1-9]\d*|(?:ef|qf|sf|f)[1-9]\d*m[1-9]\d*)$/.test(
      key,
    )
  ) {
    res.status(400).json({ error: "Invalid match key" });
    return;
  }

  try {
    const match = await prismaClient.match.findUnique({
      where: { key },
      select: {
        key: true,
        alliances: {
          orderBy: { color: "asc" },
          select: { color: true, scoreBreakdown: true },
        },
      },
    });

    if (!match) {
      res.status(404).json({ error: "Match not imported yet" });
      return;
    }

    res.set("Cache-Control", "public, max-age=30");
    res.json(match);
  } catch {
    res.status(503).json({ error: "Match data is temporarily unavailable" });
  }
}
