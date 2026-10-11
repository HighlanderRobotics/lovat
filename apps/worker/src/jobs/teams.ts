import type { PrismaClient } from "@lovat/db";
import type { createTbaClient } from "../providers/tba";

type Dependencies = {
  db: PrismaClient;
  tba: Pick<ReturnType<typeof createTbaClient>, "getStatus" | "getTeamsPage">;
};

export const importAllTeams = async (dependencies?: Dependencies) => {
  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };

  // Fetch status unconditionally: FetchState stores headers, not its page bound.
  const status = await tba.getStatus();

  if (!status.modified) throw new Error("Expected fresh TBA status");

  const maxTeamPage = status.data.max_team_page;

  for (let page = 0; page <= maxTeamPage; page++) {
    const identity = { provider: "tba", resourceKey: `teams/${page}/simple` };

    const saved = await db.fetchState.findUnique({
      where: { provider_resourceKey: identity },
    });

    const fetched = await tba.getTeamsPage(page, {
      etag: saved?.etag,
      lastModified: saved?.lastModified,
    });

    if (!fetched.modified) continue;

    await db.$transaction(async (tx) => {
      for (const team of fetched.data) {
        const name =
          team.nickname?.trim() ||
          team.name.trim() ||
          `Team ${team.team_number}`;

        await tx.team.upsert({
          where: { number: team.team_number },
          update: { name },
          create: { number: team.team_number, name },
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
    });
  }
};
