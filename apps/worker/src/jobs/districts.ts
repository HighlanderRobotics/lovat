import type { PrismaClient } from "@lovat/db";
import type { createTbaClient } from "../providers/tba";
import {
  saveHeaders,
  savedHeaders,
  saveSeasonTeam,
  validateSeason,
  validateTarget,
} from "./shared";

type Tba = ReturnType<typeof createTbaClient>;

export async function importDistricts(
  year: number,
  dependencies?: { db: PrismaClient; tba: Pick<Tba, "getDistricts"> },
) {
  validateSeason(year);

  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };
  const resourceKey = `districts/${year}`;
  const saved = await savedHeaders(db, resourceKey);
  const fetched = await tba.getDistricts(year, saved ?? {});

  if (!fetched.modified) return;

  await db.$transaction(async (tx) => {
    await tx.season.upsert({ where: { year }, update: {}, create: { year } });

    for (const district of fetched.data) {
      if (district.year !== year)
        throw new Error(`Inconsistent district season: ${district.key}`);

      const data = {
        seasonYear: year,
        name: district.display_name,
        abbreviation: district.abbreviation,
      };

      await tx.districtSeason.upsert({
        where: { key: district.key },
        update: data,
        create: { key: district.key, ...data },
      });
    }

    await saveHeaders(tx, resourceKey, fetched);
  });
}

export async function importDistrictTeams(
  districtKey: string,
  dependencies?: { db: PrismaClient; tba: Pick<Tba, "getDistrictTeams"> },
) {
  validateTarget(districtKey);

  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };
  const district = await db.districtSeason.findUniqueOrThrow({
    where: { key: districtKey },
  });
  const resourceKey = `district/${districtKey}/teams/simple`;
  const saved = await savedHeaders(db, resourceKey);
  const fetched = await tba.getDistrictTeams(districtKey, saved ?? {});

  if (!fetched.modified) return;

  await db.$transaction(
    async (tx) => {
      const numbers = fetched.data.map((team) => team.team_number);

      await tx.teamSeason.updateMany({
        where: {
          seasonYear: district.seasonYear,
          districtSeasonKey: districtKey,
          teamNumber: { notIn: numbers },
        },
        data: { districtSeasonKey: null },
      });

      for (const team of fetched.data) {
        await saveSeasonTeam(tx, team, district.seasonYear);

        await tx.teamSeason.update({
          where: {
            teamNumber_seasonYear: {
              teamNumber: team.team_number,
              seasonYear: district.seasonYear,
            },
          },
          data: { districtSeasonKey: districtKey },
        });
      }

      await saveHeaders(tx, resourceKey, fetched);
    },
    { timeout: 60_000 },
  );
}
