import type { PrismaClient } from "@lovat/db";
import type { createTbaClient } from "../providers/tba";
import {
  saveHeaders,
  savedHeaders,
  saveSeasonTeam,
  validateTarget,
} from "./shared";

type Dependencies = {
  db: PrismaClient;
  tba: Pick<
    ReturnType<typeof createTbaClient>,
    "getTournamentTeams" | "getMatchEvent"
  >;
};

export async function importTournamentTeams(
  eventKey: string,
  dependencies?: Dependencies,
) {
  validateTarget(eventKey);

  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };
  const tournament = await db.tournament.findUniqueOrThrow({
    where: { key: eventKey },
  });

  if (tournament.seasonYear === null)
    throw new Error("Import tournament season metadata first");

  const resourceKey = `event/${eventKey}/teams/simple`;
  // Each consumer tracks the metadata version applied to its own records.
  const metadataKey = `${resourceKey}?dependency=event`;

  const [saved, savedMetadata, event] = await Promise.all([
    savedHeaders(db, resourceKey),
    savedHeaders(db, metadataKey),
    tba.getMatchEvent(eventKey),
  ]);

  if (!event.modified || event.data.key !== eventKey)
    throw new Error("Expected fresh tournament metadata");

  const fetched = await tba.getTournamentTeams(
    eventKey,
    event.etag && event.etag === savedMetadata?.etag ? (saved ?? {}) : {},
  );

  if (!fetched.modified) return;

  const aliases = new Map<string, string>();

  for (const [numeric, alias] of Object.entries(event.data.remap_teams ?? {})) {
    if (aliases.has(alias))
      throw new Error(`Ambiguous participant mapping: ${alias}`);

    aliases.set(alias, numeric);
  }

  await db.$transaction(
    async (tx) => {
      const numbers: number[] = [];

      for (const team of fetched.data) {
        const key = aliases.get(team.key) ?? team.key;

        if (!/^frc\d+$/.test(key))
          throw new Error(`Missing numeric mapping for ${team.key}`);

        const teamNumber = Number(key.slice(3));

        await saveSeasonTeam(
          tx,
          { ...team, key, team_number: teamNumber },
          tournament.seasonYear!,
        );

        await tx.teamTournament.upsert({
          where: {
            teamNumber_tournamentKey: { teamNumber, tournamentKey: eventKey },
          },
          update: {},
          create: { teamNumber, tournamentKey: eventKey },
        });

        numbers.push(teamNumber);
      }

      // Roster corrections do not touch match slots or scouting reports.
      await tx.teamTournament.deleteMany({
        where: { tournamentKey: eventKey, teamNumber: { notIn: numbers } },
      });

      await saveHeaders(tx, resourceKey, fetched);
      await saveHeaders(tx, metadataKey, event);
    },
    { timeout: 60_000 },
  );
}
