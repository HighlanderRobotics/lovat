import { Request, Response } from "express";
import prismaClient from "../../../prismaClient.js";
import z from "zod";

const tbaTeamStatusSchema = z.object({
  qual: z
    .object({
      ranking: z.object({
        rank: z.number().nullable(),
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
      })
    ).map((e) => ({
      ...e,
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
      team.rankingPoints = Math.round(
        ranking.sort_orders[0] * ranking.matches_played,
      );
    }

    res.status(200).send(teams);
  } catch (error) {
    console.error(error);
    if (res.headersSent) {
      return;
    }
    res.status(500).send({ message: "Failed to load team rankings" });
  }
};
