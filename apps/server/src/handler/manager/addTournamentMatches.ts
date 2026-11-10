import prismaClient from "../../prismaClient.js";
import { addPracticeMatches } from "./addPracticeMatches.js";

// Keep existing callers, but let the worker be the only official match writer.
export const addTournamentMatches = async (
  tournamentKey: string,
): Promise<void> => {
  try {
    if (typeof tournamentKey !== "string" || !tournamentKey.trim()) return;

    const tournament = await prismaClient.tournament.findUnique({
      where: { key: tournamentKey },
      select: { key: true },
    });

    if (!tournament) return;

    try {
      await prismaClient.importJob.upsert({
        where: {
          kind_targetKey: { kind: "matches", targetKey: tournamentKey },
        },
        // Preserve the worker's active lease, refresh cadence and retry backoff.
        update: {},
        create: {
          kind: "matches",
          targetKey: tournamentKey,
          runAt: new Date(),
        },
      });
    } catch {
      console.error("Unable to queue tournament match refresh");
    }

    try {
      await addPracticeMatches(tournamentKey);
    } catch (error) {
      console.error("Failed to import Nexus practice matches", error);
    }
  } catch {
    // A failed enqueue must not prevent callers from reading stored matches.
    console.error("Unable to queue tournament match refresh");
  }
};
