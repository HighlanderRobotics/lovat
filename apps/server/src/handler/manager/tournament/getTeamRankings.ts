import { Request, Response } from "express";
import prismaClient from "../../../prismaClient.js";
import z from "zod";

const tbaTeamStatusSchema = z.object({
  qual: z
    .object({
      ranking: z.object({
        rank: z.number().nullable(),
        ranking_points: z.number().nullish(),
        matches_played: z.number(),
        sort_orders: z.array(z.number()),
      }),
    })
    .optional(),
});

type TbaTeamStatus = z.infer<typeof tbaTeamStatusSchema>;

const fetchTbaTeamStatuses = async (
  tournamentKey: string,
): Promise<Record<string, TbaTeamStatus>> => {
  try {
    const tbaResponse = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${tournamentKey}/teams/statuses`,
      {
        headers: process.env.TBA_KEY?.trim()
          ? { "X-TBA-Auth-Key": process.env.TBA_KEY.trim() }
          : {},
      },
    );
    if (!tbaResponse.ok) {
      return {};
    }

    return z
      .record(z.string(), tbaTeamStatusSchema)
      .parse(await tbaResponse.json());
  } catch (error) {
    console.error(error);
    return {};
  }
};

export const getTeamRankings = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const params = z
      .object({
        tournamentKey: z.string(),
      })
      .safeParse({
        tournamentKey: req.params.tournament,
      });
    if (!params.success) {
      res.status(400).send(params);
      return;
    }

    const rows = await prismaClient.teamMatchData.findMany({
      where: {
        tournamentKey: params.data.tournamentKey,
      },
      select: {
        teamNumber: true,
      },
    });
    if (rows.length === 0) {
      res.status(404).send("Tournament or teams not found");
      return;
    }

    const uniqueTeamNumbers = Array.from(
      new Set(rows.map((row) => row.teamNumber)),
    );
    const teams: {
      number: number;
      name: string;
      avatar: string | null;
      rank: number | null;
      rankingPoints: number | null;
      matchesPlayed: number | null;
    }[] = (
      await prismaClient.team.findMany({
        where: {
          number: {
            in: uniqueTeamNumbers,
          },
        },
        include: {
          seasons: {
            where: {
              seasonYear: Number(params.data.tournamentKey.slice(0, 4)) || 0,
            },
            select: { avatar: true },
            take: 1,
          },
        },
      })
    ).map(({ seasons, ...team }) => ({
      ...team,
      avatar: seasons?.[0]?.avatar ?? null,
      rank: null,
      rankingPoints: null,
      matchesPlayed: null,
    }));

    const tbaTeamStatuses = await fetchTbaTeamStatuses(
      params.data.tournamentKey,
    );

    for (const team of teams) {
      const ranking = tbaTeamStatuses[`frc${team.number}`]?.qual?.ranking;
      if (!ranking) {
        continue;
      }

      team.rank = ranking.rank;
      team.matchesPlayed = ranking.matches_played;
      team.rankingPoints =
        ranking.ranking_points ??
        (ranking.sort_orders.length > 0
          ? Math.round(ranking.sort_orders[0] * ranking.matches_played)
          : null);
    }

    res.status(200).send(teams);
  } catch (error) {
    console.error(error);
    if (res.headersSent) {
      return;
    }
    res.status(500).send("Internal server error");
  }
};
