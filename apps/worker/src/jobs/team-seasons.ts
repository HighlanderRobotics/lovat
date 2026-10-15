import type { PrismaClient } from "@lovat/db";
import type { createTbaClient } from "../providers/tba";
import {
  saveHeaders,
  savedHeaders,
  saveSeasonTeam,
  validateSeason,
} from "./shared";

type Dependencies = {
  db: PrismaClient;
  tba: Pick<
    ReturnType<typeof createTbaClient>,
    "getStatus" | "getSeasonTeamsPage"
  >;
};

export async function importTeamSeasons(
  year: number,
  dependencies?: Dependencies,
) {
  validateSeason(year);

  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };
  const status = await tba.getStatus();

  if (!status.modified) throw new Error("Expected fresh TBA status");

  for (let page = 0; page <= status.data.max_team_page; page++) {
    const resourceKey = `teams/${year}/${page}/simple`;
    const saved = await savedHeaders(db, resourceKey);
    const fetched = await tba.getSeasonTeamsPage(year, page, saved ?? {});

    if (!fetched.modified) continue;

    await db.$transaction(
      async (tx) => {
        await tx.season.upsert({
          where: { year },
          update: {},
          create: { year },
        });

        for (const team of fetched.data) await saveSeasonTeam(tx, team, year);

        await saveHeaders(tx, resourceKey, fetched);
      },
      { timeout: 60_000 },
    );
  }
}
