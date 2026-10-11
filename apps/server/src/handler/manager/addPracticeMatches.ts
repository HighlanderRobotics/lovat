import prismaClient from "../../prismaClient.js";
import { fetchPracticeMatches } from "../../lib/fetchPracticeMatches.js";

export const addPracticeMatches = async (
  tournamentKey: string,
): Promise<void> => {
  const practiceMatches = await fetchPracticeMatches(tournamentKey);

  for (const match of practiceMatches) {
    for (const teamNumber of match.teamNumbers) {
      const key = `${tournamentKey}_pm${match.matchNumber}_${teamNumber}`;
      await prismaClient.teamMatchData.upsert({
        where: { key: key },
        update: { practiceScheduled: true },
        create: {
          key: key,
          tournamentKey: tournamentKey,
          matchNumber: match.matchNumber,
          teamNumber: teamNumber,
          matchType: "PRACTICE",
          practiceScheduled: true,
        },
      });
    }
  }
};
