import type { PrismaClient } from "@lovat/db";
import type { createTbaClient } from "../providers/tba";

type Dependencies = {
  db: PrismaClient;
  tba: Pick<ReturnType<typeof createTbaClient>, "getTournaments">;
};

export const importTournaments = async (
  initialYear = 2023,
  finalYear = new Date().getUTCFullYear(),
  dependencies?: Dependencies,
) => {
  if (
    !Number.isSafeInteger(initialYear) ||
    !Number.isSafeInteger(finalYear) ||
    initialYear < 1992 ||
    finalYear < initialYear
  ) {
    throw new Error(
      "Provide an ascending tournament year range starting in 1992 or later",
    );
  }

  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };

  for (let year = initialYear; year <= finalYear; year++) {
    const identity = {
      provider: "tba",
      resourceKey: `events/${year}`,
    };

    const saved = await db.fetchState.findUnique({
      where: { provider_resourceKey: identity },
    });

    const fetched = await tba.getTournaments(year, {
      etag: saved?.etag,
      lastModified: saved?.lastModified,
    });

    if (!fetched.modified) continue;

    for (const tournament of fetched.data) {
      if (
        tournament.year !== year ||
        (tournament.district && tournament.district.year !== year)
      ) {
        throw new Error(
          `TBA returned inconsistent season data for ${tournament.key}`,
        );
      }

      if (tournament.parent_event_key === tournament.key) {
        throw new Error(
          `TBA tournament cannot be its own parent: ${tournament.key}`,
        );
      }
    }

    await db.$transaction(
      async (tx) => {
        await tx.season.upsert({
          where: { year },
          update: {},
          create: { year },
        });

        for (const tournament of fetched.data) {
          const district = tournament.district;

          if (district) {
            const data = {
              seasonYear: district.year,
              abbreviation: district.abbreviation,
              name: district.display_name,
            };

            await tx.districtSeason.upsert({
              where: { key: district.key },
              update: data,
              create: { key: district.key, ...data },
            });
          }

          const data = {
            name: tournament.name,
            location: tournament.city,
            date: tournament.start_date,
            seasonYear: year,
            startDate: new Date(`${tournament.start_date}T00:00:00.000Z`),
            endDate: new Date(`${tournament.end_date}T00:00:00.000Z`),
            timezone: tournament.timezone,
            eventType: tournament.event_type,
            playoffType: tournament.playoff_type,
            districtSeasonKey: district?.key ?? null,
          };

          await tx.tournament.upsert({
            where: { key: tournament.key },
            update: data,
            create: { key: tournament.key, ...data },
          });
        }

        // All tournament parents must exist before linking divisions.
        for (const tournament of fetched.data) {
          await tx.tournament.update({
            where: { key: tournament.key },
            data: { parentTournamentKey: tournament.parent_event_key },
          });
        }

        const headers = {
          etag: fetched.etag,
          lastModified: fetched.lastModified,
        };

        await tx.fetchState.upsert({
          where: { provider_resourceKey: identity },
          update: headers,
          create: { ...identity, ...headers },
        });
      },
      { timeout: 60_000 },
    );
  }
};
