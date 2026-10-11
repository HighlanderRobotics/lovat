import type { Request, Response } from "express";
import prismaClient from "../../prismaClient.js";

function teamAwards(awards: unknown, teamNumber: number): string[] {
  if (!Array.isArray(awards)) return [];

  return awards.flatMap((award: unknown) => {
    if (!award || typeof award !== "object") return [];

    const { name, recipients } = award as Record<string, unknown>;

    if (typeof name !== "string" || !Array.isArray(recipients)) return [];

    const received = recipients.some(
      (recipient: unknown) =>
        recipient !== null &&
        typeof recipient === "object" &&
        (recipient as Record<string, unknown>).teamNumber === teamNumber,
    );

    return received ? [name] : [];
  });
}

export async function getTeamSeason(
  req: Request,
  res: Response,
): Promise<void> {
  const number = req.params.number;
  const year = req.params.year;

  if (
    typeof number !== "string" ||
    !/^[1-9]\d{0,9}$/.test(number) ||
    Number(number) > 2_147_483_647 ||
    typeof year !== "string" ||
    !/^\d{4}$/.test(year) ||
    Number(year) < 1992
  ) {
    res.status(400).json({ error: "Invalid team or season" });
    return;
  }

  const teamNumber = Number(number);
  const seasonYear = Number(year);

  try {
    const team = await prismaClient.teamSeason.findUnique({
      where: { teamNumber_seasonYear: { teamNumber, seasonYear } },
      select: {
        teamNumber: true,
        seasonYear: true,
        name: true,
        city: true,
        stateProvince: true,
        country: true,
        avatar: true,
        district: { select: { key: true, abbreviation: true, name: true } },
        team: {
          select: {
            seasons: {
              orderBy: { seasonYear: "desc" },
              select: { seasonYear: true },
            },
            tournamentTeams: {
              where: { tournament: { seasonYear } },
              orderBy: { tournament: { startDate: "asc" } },
              select: {
                tournament: {
                  select: {
                    key: true,
                    name: true,
                    location: true,
                    week: true,
                    startDate: true,
                    endDate: true,
                    awards: true,
                    district: { select: { abbreviation: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!team) {
      res.status(404).json({ error: "Team season not imported yet" });
      return;
    }

    const { team: history, ...profile } = team;

    res.set("Cache-Control", "public, max-age=300");
    res.json({
      ...profile,
      seasonYears: history.seasons.map((season) => season.seasonYear),
      tournaments: history.tournamentTeams.map(({ tournament }) => ({
        ...tournament,
        awards: teamAwards(tournament.awards, teamNumber),
      })),
    });
  } catch {
    res.status(503).json({ error: "Team data is temporarily unavailable" });
  }
}
