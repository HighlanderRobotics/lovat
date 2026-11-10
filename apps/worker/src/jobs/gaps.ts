import type { Prisma, PrismaClient } from "@lovat/db";
import { inferTournamentGaps } from "../gaps";
import { validateTarget } from "./shared";

export async function lockTournament(
  tx: Prisma.TransactionClient,
  eventKey: string,
) {
  await tx.$queryRaw`SELECT "key" FROM "Tournament" WHERE "key" = ${eventKey} FOR UPDATE`;
}

export async function saveTournamentGaps(
  tx: Prisma.TransactionClient,
  eventKey: string,
) {
  const event = await tx.tournament.findUniqueOrThrow({
    where: { key: eventKey },
    select: { timezone: true },
  });
  const matches = await tx.match.findMany({
    where: { tournamentKey: eventKey },
  });
  const gaps = inferTournamentGaps(eventKey, event.timezone, matches);

  await tx.tournamentGap.deleteMany({ where: { tournamentKey: eventKey } });

  if (gaps.length) await tx.tournamentGap.createMany({ data: gaps });
}

export async function refreshTournamentGaps(
  eventKey: string,
  dependencies?: { db: PrismaClient },
) {
  validateTarget(eventKey);

  const { db } = dependencies ?? { db: (await import("../db")).db };

  await db.$transaction(
    async (tx) => {
      await lockTournament(tx, eventKey);
      await saveTournamentGaps(tx, eventKey);
    },
    { timeout: 60_000 },
  );
}
