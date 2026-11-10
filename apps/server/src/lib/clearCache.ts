import prismaClient from "../prismaClient.js";
import { kv } from "../redisClient.js";

// Keep dependency metadata so in-flight analyses remain discoverable by invalidation.
export const resetCache = async (): Promise<void> => {
  const deletedRedisKeys = await kv.reset();
  console.log(`Lovat cache reset (${deletedRedisKeys} Redis keys deleted)`);
};

export const invalidateCache = async (
  teams: number | number[],
  tournaments: string | string[],
): Promise<void> => {
  const teamsClause = Array.isArray(teams)
    ? { hasSome: teams }
    : { has: teams };
  const tournamentsClause = Array.isArray(tournaments)
    ? { hasSome: tournaments }
    : { has: tournaments };

  const analysisRows = await prismaClient.cachedAnalysis.findMany({
    where: {
      OR: [
        { teamDependencies: teamsClause },
        { tournamentDependencies: tournamentsClause },
      ],
    },
    select: { key: true },
  });

  if (analysisRows.length > 0) {
    const keysToDelete = analysisRows.map((row) => row.key);

    await kv.del(keysToDelete);

    await prismaClient.cachedAnalysis.deleteMany({
      where: { key: { in: keysToDelete } },
    });
  }
};
