import type { Request, Response } from "express";
import prisma from "../../prismaClient.js";
import { publicCache } from "../../lib/publicCache.js";

export async function getSearch(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const year = Number(req.query.year);

  if (
    !query ||
    query.length > 80 ||
    !Number.isInteger(year) ||
    year < 1992 ||
    year > 9999
  ) {
    res.status(400).json({ error: "Invalid search" });
    return;
  }

  try {
    const results = await publicCache(
      `search:${year}:${encodeURIComponent(query.toLowerCase())}`,
      async () => {
        const numeric = /^\d{1,9}$/.test(query) ? Number(query) : undefined;
        const [events, teams] = await Promise.all([
          prisma.tournament.findMany({
            where: {
              seasonYear: year,
              OR: ["name", "key", "location"].map((field) => ({
                [field]: { contains: query, mode: "insensitive" },
              })),
            },
            orderBy: [{ startDate: "asc" }, { key: "asc" }],
            take: 20,
            select: { key: true, name: true, location: true },
          }),
          prisma.teamSeason.findMany({
            where: {
              seasonYear: year,
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                ...(numeric ? [{ teamNumber: numeric }] : []),
              ],
            },
            orderBy: { teamNumber: "asc" },
            take: 20,
            select: { teamNumber: true, name: true, city: true },
          }),
        ]);

        return { year, events, teams };
      },
      60,
    );

    res.set("Cache-Control", "public, max-age=60");
    res.json(results);
  } catch {
    res.status(503).json({ error: "Search unavailable" });
  }
}
