import type { ImportJob, PrismaClient } from "@lovat/db";
import { importAllTeams } from "./jobs/teams";
import { importTournaments } from "./jobs/tournaments";
import { importTeamSeasons } from "./jobs/team-seasons";
import { importDistricts, importDistrictTeams } from "./jobs/districts";
import { importTournamentTeams } from "./jobs/tournament-teams";
import { importTournamentDetails } from "./jobs/tournament-details";
import { importMatches } from "./jobs/matches";
import { refreshTournamentGaps } from "./jobs/gaps";
import { validateSeason, validateTarget } from "./jobs/shared";
import { TbaHttpError } from "./providers/tba";
import { day, hour, minute, tournamentCadence } from "./schedule";

export const jobKinds = [
  "maintenance",
  "teams",
  "tournaments",
  "team-seasons",
  "districts",
  "district-teams",
  "tournament-teams",
  "tournament-details",
  "matches",
  "gaps",
] as const;
export type JobKind = (typeof jobKinds)[number];

const leaseMs = 90_000;

export async function enqueueImport(
  db: PrismaClient,
  kind: JobKind,
  targetKey: string,
  runAt = new Date(),
) {
  if (!jobKinds.includes(kind)) throw new Error("Unknown import kind");

  validateTarget(targetKey);

  if (["tournaments", "team-seasons", "districts"].includes(kind))
    validateSeason(Number(targetKey));
  if (["teams", "maintenance"].includes(kind) && targetKey !== "global")
    throw new Error("Team catalog target must be global");

  // Preserve existing leases, retry delays and recurring run times.
  return db.importJob.upsert({
    where: { kind_targetKey: { kind, targetKey } },
    update: {},
    create: { kind, targetKey, runAt },
  });
}

async function ensureRecurring(
  db: PrismaClient,
  kind: JobKind,
  targetKey: string,
  interval: number,
  now: Date,
  existing?: ImportJob,
) {
  if (!existing) {
    await enqueueImport(db, kind, targetKey, now);
    return;
  }

  const runAt = new Date(now.getTime() + interval);

  if (
    existing.attempts ||
    existing.lastError ||
    existing.runAt <= runAt ||
    (existing.leaseExpiresAt && existing.leaseExpiresAt > now)
  )
    return;

  // Entering an active window may bring a previously slow refresh forward.
  await db.importJob.updateMany({
    where: {
      id: existing.id,
      attempts: 0,
      lastError: null,
      runAt: { gt: runAt },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: { runAt },
  });
}

export async function reconcileSchedule(
  db: PrismaClient,
  now = new Date(),
  year = now.getUTCFullYear(),
  includeArchived = false,
) {
  validateSeason(year);

  const [districts, tournaments, jobs] = await Promise.all([
    db.districtSeason.findMany({
      where: { seasonYear: year },
      select: { key: true },
    }),
    db.tournament.findMany({
      where: { seasonYear: year },
      select: { key: true, startDate: true, endDate: true, timezone: true },
    }),
    db.importJob.findMany(),
  ]);

  const existing = new Map(
    jobs.map((job) => [`${job.kind}:${job.targetKey}`, job]),
  );
  const ensure = (kind: JobKind, target: string, interval: number) =>
    ensureRecurring(
      db,
      kind,
      target,
      interval,
      now,
      existing.get(`${kind}:${target}`),
    );

  if (year === now.getUTCFullYear()) {
    await ensure("maintenance", "global", day);
    await ensure("teams", "global", 7 * day);
    await ensure("tournaments", String(year), 6 * hour);
    await ensure("team-seasons", String(year), 7 * day);
    await ensure("districts", String(year), day);
  }

  for (const district of districts)
    await ensure("district-teams", district.key, day);

  for (const tournament of tournaments) {
    const cadence = tournamentCadence(tournament, now);
    if (cadence.phase === "archived" && !includeArchived) continue;

    await ensure("tournament-teams", tournament.key, cadence.roster);
    await ensure("tournament-details", tournament.key, cadence.roster);
    await ensure("matches", tournament.key, cadence.matches);
  }
}

export async function claimJob(
  db: PrismaClient,
  now = new Date(),
  id: string | null = null,
  cutoff = now,
) {
  const token = crypto.randomUUID();
  const expires = new Date(now.getTime() + leaseMs);

  // Claim atomically so multiple worker processes cannot take the same lease.
  const jobs = await db.$queryRaw<ImportJob[]>`
    UPDATE "ImportJob" AS job
    SET "leaseToken" = ${token}, "leaseExpiresAt" = ${expires}
    FROM (
      SELECT "id" FROM "ImportJob"
      WHERE "runAt" <= ${cutoff}
        AND (${id}::text IS NULL OR "id" = ${id})
        AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${now})
      ORDER BY CASE
        WHEN "kind" = 'matches' AND EXISTS (
          SELECT 1 FROM "Tournament" AS event
          WHERE event."key" = "ImportJob"."targetKey"
            AND event."startDate" <= ${now}::timestamp + INTERVAL '1 day'
            AND event."endDate" >= ${now}::timestamp - INTERVAL '1 day'
        ) THEN 0
        WHEN "kind" IN ('tournaments', 'districts') THEN 1
        ELSE 2
      END, "runAt", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    ) AS candidate
    WHERE job."id" = candidate."id"
    RETURNING job.*
  `;

  return jobs[0] ?? null;
}

export async function executeImport(
  job: Pick<ImportJob, "kind" | "targetKey">,
  db: PrismaClient,
) {
  if (job.kind === "maintenance") {
    const { runMaintenance } = await import("./jobs/maintenance");
    return runMaintenance(db);
  }

  const { tba } = await import("./tba");
  const dependencies = { db, tba };
  const year = Number(job.targetKey);

  switch (job.kind) {
    case "teams":
      return importAllTeams(dependencies);
    case "tournaments":
      await importTournaments(year, year, dependencies);
      return reconcileSchedule(
        db,
        new Date(),
        year,
        year < new Date().getUTCFullYear(),
      );
    case "team-seasons":
      return importTeamSeasons(year, dependencies);
    case "districts":
      await importDistricts(year, dependencies);
      return reconcileSchedule(
        db,
        new Date(),
        year,
        year < new Date().getUTCFullYear(),
      );
    case "district-teams":
      return importDistrictTeams(job.targetKey, dependencies);
    case "tournament-teams":
      return importTournamentTeams(job.targetKey, dependencies);
    case "tournament-details":
      return importTournamentDetails(job.targetKey, dependencies);
    case "matches":
      return importMatches(job.targetKey, dependencies);
    case "gaps":
      return refreshTournamentGaps(job.targetKey, { db });
    default:
      throw new Error("Unknown import kind");
  }
}

async function refreshInterval(db: PrismaClient, job: ImportJob, now: Date) {
  if (job.kind === "maintenance") return day;
  if (job.kind === "gaps") return null;
  if (
    ["tournaments", "team-seasons", "districts"].includes(job.kind) &&
    Number(job.targetKey) < now.getUTCFullYear()
  )
    return null;
  if (
    job.kind === "district-teams" &&
    Number(job.targetKey.slice(0, 4)) < now.getUTCFullYear()
  )
    return null;
  if (job.kind === "teams" || job.kind === "team-seasons") return 7 * day;
  if (job.kind === "tournaments") return 6 * hour;
  if (job.kind === "districts" || job.kind === "district-teams") return day;

  const event = await db.tournament.findUniqueOrThrow({
    where: { key: job.targetKey },
  });
  const cadence = tournamentCadence(event, now);

  if (cadence.phase === "archived") return null;

  return job.kind === "matches" ? cadence.matches : cadence.roster;
}

export function retryDelay(attempts: number, error: unknown, now = new Date()) {
  const backoff = Math.min(hour, minute * 2 ** Math.min(attempts, 6));

  if (!(error instanceof TbaHttpError) || !error.retryAfter) return backoff;

  const seconds = Number(error.retryAfter);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(error.retryAfter) - now.getTime();

  return Number.isFinite(delay) ? Math.max(backoff, delay) : backoff;
}

export async function runNextJob(
  db: PrismaClient,
  execute: (job: ImportJob, db: PrismaClient) => Promise<void> = executeImport,
  claim: { cutoff: Date; id: string } | undefined = undefined,
) {
  const job = await claimJob(db, new Date(), claim?.id, claim?.cutoff);

  if (!job) return false;

  const startedAt = Date.now();
  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.info(
      JSON.stringify({
        event,
        kind: job.kind,
        target: job.targetKey,
        attempt: job.attempts + 1,
        durationMs: Date.now() - startedAt,
        queueDelayMs: Math.max(0, startedAt - job.runAt.getTime()),
        ...extra,
      }),
    );
  log("job.started");
  let renewal: Promise<void> | undefined;
  let renewing = false;
  let lostLease = false;

  const heartbeat = setInterval(() => {
    if (!renewing && !lostLease) renewal = renew();
  }, 30_000);

  const renew = async () => {
    if (renewing || lostLease) return;

    renewing = true;

    try {
      const now = new Date();
      const renewed = await db.importJob.updateMany({
        where: {
          id: job.id,
          leaseToken: job.leaseToken,
          leaseExpiresAt: { gt: now },
        },
        data: { leaseExpiresAt: new Date(now.getTime() + leaseMs) },
      });

      lostLease = renewed.count !== 1;
    } catch {
      lostLease = true;
    } finally {
      renewing = false;
    }
  };

  try {
    await execute(job, db);

    const now = new Date();
    const interval = await refreshInterval(db, job, now);

    if (!lostLease) {
      const where = {
        id: job.id,
        leaseToken: job.leaseToken,
        leaseExpiresAt: { gt: now },
      };
      if (interval === null) {
        const completed = await db.importJob.deleteMany({ where });
        log(completed.count === 1 ? "job.completed" : "job.lease_lost", {
          finalized: true,
        });
        return true;
      }
      const completed = await db.importJob.updateMany({
        where: {
          id: job.id,
          leaseToken: job.leaseToken,
          leaseExpiresAt: { gt: now },
        },
        data: {
          runAt: new Date(now.getTime() + interval),
          attempts: 0,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      if (completed.count === 1) {
        log("job.completed", {
          nextRunAt: new Date(now.getTime() + interval).toISOString(),
        });
      }
    }
  } catch (error) {
    const now = new Date();
    // Avoid persisting raw upstream bodies or database errors containing secrets.
    const lastError =
      error instanceof TbaHttpError
        ? error.message
        : error instanceof Error
          ? error.name
          : "Unknown import error";

    if (!lostLease) {
      await db.importJob.updateMany({
        where: {
          id: job.id,
          leaseToken: job.leaseToken,
          leaseExpiresAt: { gt: now },
        },
        data: {
          runAt: new Date(now.getTime() + retryDelay(job.attempts, error, now)),
          attempts: { increment: 1 },
          lastError,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
    }

    log("job.failed", {
      error: lastError,
      retryDelayMs: retryDelay(job.attempts, error, now),
    });
  } finally {
    clearInterval(heartbeat);
    await renewal;
  }

  return true;
}
