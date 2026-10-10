import type { Prisma, PrismaClient } from "@lovat/db";
import type { TbaResponse, TbaTeam } from "../providers/tba";

export function validateSeason(year: number) {
  if (!Number.isSafeInteger(year) || year < 1992 || year > 9999) {
    throw new Error("Season year must be an integer between 1992 and 9999");
  }
}

export function validateTarget(key: string) {
  if (!key.trim()) throw new Error("Import target key is required");
}

export function cacheIdentity(resourceKey: string) {
  return { provider: "tba", resourceKey };
}

export async function savedHeaders(db: PrismaClient, resourceKey: string) {
  return db.fetchState.findUnique({
    where: { provider_resourceKey: cacheIdentity(resourceKey) },
  });
}

export async function saveHeaders(
  tx: Prisma.TransactionClient,
  resourceKey: string,
  response: TbaResponse<unknown>,
) {
  const identity = cacheIdentity(resourceKey);
  const headers = { etag: response.etag, lastModified: response.lastModified };

  await tx.fetchState.upsert({
    where: { provider_resourceKey: identity },
    update: headers,
    create: { ...identity, ...headers },
  });
}

export async function saveSeasonTeam(
  tx: Prisma.TransactionClient,
  team: TbaTeam,
  year: number,
) {
  if (
    team.key !== `frc${team.team_number}` ||
    !Number.isSafeInteger(team.team_number) ||
    team.team_number <= 0 ||
    team.team_number > 2_147_483_647
  ) {
    throw new Error(`Inconsistent team identity: ${team.key}`);
  }

  const name =
    team.nickname?.trim() || team.name.trim() || `Team ${team.team_number}`;

  // Historical imports must not replace the global team's current name.
  await tx.team.upsert({
    where: { number: team.team_number },
    update: {},
    create: { number: team.team_number, name },
  });

  const data = {
    name,
    city: team.city,
    stateProvince: team.state_prov,
    country: team.country,
  };

  await tx.teamSeason.upsert({
    where: {
      teamNumber_seasonYear: { teamNumber: team.team_number, seasonYear: year },
    },
    update: data,
    create: { teamNumber: team.team_number, seasonYear: year, ...data },
  });
}
