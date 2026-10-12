import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import {
  claimJob,
  enqueueImport,
  reconcileSchedule,
  runNextJob,
} from "../src/scheduler";
import { day, minute } from "../src/schedule";
import { TbaHttpError } from "../src/providers/tba";

const enabled = process.env.LOVAT_DB_TEST === "1";
const fixture = crypto.randomUUID();
const year = 2094;
const eventKey = `${fixture}-event`;
const kinds = [
  "teams",
  "tournaments",
  "team-seasons",
  "districts",
  "district-teams",
  "tournament-teams",
  "tournament-details",
  "matches",
];
const now = new Date("2094-03-06T18:00:00Z");

let db: PrismaClient;

beforeAll(async () => {
  if (!enabled) return;

  const url = new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/missing",
  );

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lovat_test"
  )
    throw new Error("Use only a disposable local lovat_test database");

  const { createDb } = await import("@lovat/db");
  db = createDb(url.href);

  await db.season.create({ data: { year } });
  await db.tournament.create({
    data: {
      key: eventKey,
      name: "Scheduler fixture",
      seasonYear: year,
      startDate: new Date("2094-03-05T00:00:00Z"),
      endDate: new Date("2094-03-07T00:00:00Z"),
      timezone: "America/Los_Angeles",
    },
  });
});

afterAll(async () => {
  if (!db) return;

  try {
    await db.importJob.deleteMany({
      where: {
        OR: [
          { targetKey: { startsWith: fixture } },
          { targetKey: String(year) },
          { kind: "teams", targetKey: "global" },
        ],
      },
    });
    await db.tournament.delete({ where: { key: eventKey } });
    await db.season.delete({ where: { year } });
  } finally {
    await db.$disconnect();
  }
});

test.skipIf(!enabled)(
  "reconciliation is idempotent, accelerates active jobs and preserves retry delays",
  async () => {
    await reconcileSchedule(db, now, year);
    await reconcileSchedule(db, now, year);

    expect(await db.importJob.count({ where: { targetKey: eventKey } })).toBe(
      3,
    );

    await db.importJob.update({
      where: { kind_targetKey: { kind: "matches", targetKey: eventKey } },
      data: { runAt: new Date(now.getTime() + day) },
    });
    await reconcileSchedule(db, now, year);

    expect(
      (
        await db.importJob.findUniqueOrThrow({
          where: { kind_targetKey: { kind: "matches", targetKey: eventKey } },
        })
      ).runAt.getTime(),
    ).toBe(now.getTime() + minute);

    await db.importJob.update({
      where: { kind_targetKey: { kind: "matches", targetKey: eventKey } },
      data: {
        attempts: 1,
        lastError: "429",
        runAt: new Date(now.getTime() + day),
      },
    });
    await reconcileSchedule(db, now, year);

    expect(
      (
        await db.importJob.findUniqueOrThrow({
          where: { kind_targetKey: { kind: "matches", targetKey: eventKey } },
        })
      ).runAt.getTime(),
    ).toBe(now.getTime() + day);

    // Keep these recurring fixture jobs out of claims in the remaining tests.
    await db.importJob.updateMany({
      where: { kind: { in: kinds } },
      data: { runAt: now },
    });
  },
);

test.skipIf(!enabled)(
  "competing claims lease a due job once, then recover its expired lease",
  async () => {
    const targetKey = `${fixture}-claim`;
    const job = await enqueueImport(db, "matches", targetKey);
    const claims = await Promise.all([claimJob(db), claimJob(db)]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimed = claims.find(Boolean)!;
    expect(claimed.id).toBe(job.id);

    const other = claims.find((candidate) => candidate === null);
    expect(other).toBeNull();

    await db.importJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    const reclaimed = await claimJob(db);

    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.leaseToken).not.toBe(claimed.leaseToken);

    await db.importJob.delete({ where: { id: job.id } });
  },
);

test.skipIf(!enabled)(
  "successful jobs reschedule, failures honor Retry-After and stale completions are fenced",
  async () => {
    const job = await enqueueImport(db, "matches", eventKey);
    await db.importJob.update({
      where: { id: job.id },
      data: { runAt: new Date(0), attempts: 2, lastError: "old" },
    });

    await runNextJob(db, async () => {});

    const completed = await db.importJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(completed.attempts).toBe(0);
    expect(completed.lastError).toBeNull();
    expect(completed.leaseToken).toBeNull();
    expect(completed.runAt.getTime()).toBeGreaterThan(Date.now());

    await db.importJob.update({
      where: { id: job.id },
      data: { runAt: new Date(0) },
    });
    const before = Date.now();

    await runNextJob(db, async () => {
      throw new TbaHttpError("matches", 429, "300");
    });

    const failed = await db.importJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain("429");
    expect(failed.runAt.getTime()).toBeGreaterThanOrEqual(before + 300_000);

    await db.importJob.update({
      where: { id: job.id },
      data: { runAt: new Date(0) },
    });

    await runNextJob(db, async (claimed) => {
      await db.importJob.update({
        where: { id: claimed.id },
        data: {
          leaseToken: "replacement-token",
          leaseExpiresAt: new Date(Date.now() + minute),
          lastError: "replacement",
        },
      });
    });

    const replaced = await db.importJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(replaced.leaseToken).toBe("replacement-token");
    expect(replaced.lastError).toBe("replacement");
  },
);

test.skipIf(!enabled)(
  "active matches take priority over an older background job",
  async () => {
    const today = new Date(new Date().toISOString().slice(0, 10));

    await db.tournament.update({
      where: { key: eventKey },
      data: { startDate: today, endDate: today },
    });
    await db.importJob.update({
      where: { kind_targetKey: { kind: "matches", targetKey: eventKey } },
      data: { runAt: new Date(), leaseToken: null, leaseExpiresAt: null },
    });
    const background = await enqueueImport(
      db,
      "team-seasons",
      "2095",
      new Date(0),
    );

    try {
      expect((await claimJob(db))?.targetKey).toBe(eventKey);
    } finally {
      await db.importJob.delete({ where: { id: background.id } });
    }
  },
);
