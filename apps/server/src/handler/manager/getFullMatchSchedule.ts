import prismaClient from "../../prismaClient.js";
import { addTournamentMatches } from "./addTournamentMatches.js";
import { createFullMatchScheduleHandler } from "./fullMatchSchedule.js";

export const getFullMatchSchedule = createFullMatchScheduleHandler({
  authorize: async (code) =>
    !!(await prismaClient.registeredTeam.findUnique({
      where: { code },
      select: { number: true },
    })),
  refresh: addTournamentMatches,
  read: (tournamentKey) =>
    prismaClient.teamMatchData.findMany({
      where: { tournamentKey },
      select: {
        key: true,
        matchNumber: true,
        matchType: true,
        teamNumber: true,
      },
      orderBy: [{ matchType: "asc" }, { matchNumber: "asc" }, { key: "asc" }],
    }),
});
