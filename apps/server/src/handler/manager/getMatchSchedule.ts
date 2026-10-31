import { Request, Response } from "express";
import { MatchType } from "@lovat/db";
import z from "zod";
import prismaClient from "../../prismaClient.js";
import { addTournamentMatches } from "./addTournamentMatches.js";
import { ReverseMatchTypeMap } from "./managerConstants.js";

// Collection needs official team assignments, without Dashboard's private reports.
export const getMatchSchedule = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const params = z
      .object({ teamCode: z.string().min(1), tournament: z.string().min(1) })
      .safeParse({
        teamCode: req.headers["x-team-code"],
        tournament: req.params.tournament,
      });
    if (!params.success) {
      res
        .status(400)
        .json({ displayError: "A team code and tournament are required." });
      return;
    }
    const team = await prismaClient.registeredTeam.findUnique({
      where: { code: params.data.teamCode },
      select: { number: true },
    });
    if (!team) {
      res.status(401).json({ displayError: "Team code does not exist." });
      return;
    }

    await addTournamentMatches(params.data.tournament);
    const rows = await prismaClient.teamMatchData.findMany({
      where: {
        tournamentKey: params.data.tournament,
        OR: [
          {
            matchType: { in: [MatchType.QUALIFICATION, MatchType.ELIMINATION] },
          },
          { matchType: MatchType.PRACTICE, practiceScheduled: true },
        ],
      },
      select: {
        key: true,
        matchNumber: true,
        matchType: true,
        teamNumber: true,
      },
      orderBy: [{ matchType: "asc" }, { matchNumber: "asc" }, { key: "asc" }],
    });
    const matches = new Map<
      string,
      {
        matchNumber: number;
        matchType: number;
        teams: { number: number; alliance: "red" | "blue" | null }[];
      }
    >();
    for (const row of rows) {
      const key = `${row.matchType}_${row.matchNumber}`;
      const match = matches.get(key) ?? {
        matchNumber: row.matchNumber,
        matchType: ReverseMatchTypeMap[row.matchType],
        teams: [],
      };
      match.teams.push({
        number: row.teamNumber,
        alliance:
          row.matchType === MatchType.PRACTICE
            ? null
            : Number(row.key.split("_").at(-1)) < 3
              ? "red"
              : "blue",
      });
      matches.set(key, match);
    }
    res.json({
      tournamentKey: params.data.tournament,
      matches: [...matches.values()],
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ displayError: "Unable to fetch the match schedule." });
  }
};
