import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import type { TbaTournament } from "../src/providers/tba";
import { importTournaments } from "../src/jobs/tournaments";

const enabled = process.env.LOVAT_DB_TEST === "1";
const fixture = crypto.randomUUID();
const years = [2090, 2091, 2092];

let db: PrismaClient;

const tournament = (key: string, year: number): TbaTournament => ({
  key,
  year,
  name: "Tournament fixture",
  city: "San Jose",
  start_date: `${year}-03-01`,
  end_date: `${year}-03-03`,
  timezone: "America/Los_Angeles",
  event_type: 0,
  playoff_type: 10,
  week: 2,
  parent_event_key: null,
  district: null,
});

beforeAll(async () => {
  if (!enabled) return;

  const url = new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/missing",
  );

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lovat_test"
  ) {
    throw new Error("Use only a disposable local lovat_test database");
  }

  const { createDb } = await import("@lovat/db");

  db = createDb(url.href);
});

afterAll(async () => {
  if (!db) return;

  try {
    await db.tournament.deleteMany({ where: { key: { startsWith: fixture } } });
    await db.districtSeason.deleteMany({
      where: { key: { startsWith: fixture } },
    });
    await db.season.deleteMany({
      where: {
        year: { in: years },
        tournaments: { none: {} },
        teamSeasons: { none: {} },
        districtSeasons: { none: {} },
      },
    });
    await db.fetchState.deleteMany({
      where: {
        provider: "tba",
        resourceKey: {
          in: years.map((year) => `events/${year}?schema=weeks-v1`),
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test.skipIf(!enabled)(
  "imports inclusive years, district parents, dates and child-first event lists",
  async () => {
    const calls: number[] = [];
    let cached = false;

    const parent = tournament(`${fixture}-parent`, 2091);

    const child = {
      ...tournament(`${fixture}-child`, 2091),
      parent_event_key: parent.key,
      district: {
        key: `${fixture}-district`,
        year: 2091,
        abbreviation: fixture,
        display_name: "District fixture",
      },
    };

    const tba = {
      async getTournaments(year: number, options?: { etag?: string | null }) {
        calls.push(year);

        if (cached) {
          expect(options?.etag).toBe(`year-${year}`);

          return {
            modified: false as const,
            etag: `year-${year}`,
            lastModified: null,
          };
        }

        return {
          modified: true as const,
          data: year === 2090 ? [] : [child, parent],
          etag: `year-${year}`,
          lastModified: null,
        };
      },
    };

    await importTournaments(2090, 2091, { db, tba });

    expect(calls).toEqual([2090, 2091]);

    const saved = await db.tournament.findUniqueOrThrow({
      where: { key: child.key },
      include: { district: true },
    });

    expect(saved.parentTournamentKey).toBe(parent.key);
    expect(saved.district?.name).toBe("District fixture");
    expect(saved.startDate?.toISOString()).toBe("2091-03-01T00:00:00.000Z");
    expect(saved.date).toBe("2091-03-01");
    expect(saved.timezone).toBe("America/Los_Angeles");
    expect(saved.week).toBe(2);

    await db.tournament.update({
      where: { key: child.key },
      data: { latestFetchETag: "match-etag" },
    });

    cached = true;
    calls.length = 0;

    await importTournaments(2090, 2091, { db, tba });

    expect(calls).toEqual([2090, 2091]);
    expect(
      await db.tournament.count({ where: { key: { startsWith: fixture } } }),
    ).toBe(2);
    expect(
      (await db.tournament.findUniqueOrThrow({ where: { key: child.key } }))
        .latestFetchETag,
    ).toBe("match-etag");
  },
);

test.skipIf(!enabled)(
  "missing parents roll back the season, tournaments and cache update",
  async () => {
    const identity = {
      provider: "tba",
      resourceKey: "events/2092?schema=weeks-v1",
    };

    await db.fetchState.upsert({
      where: { provider_resourceKey: identity },
      create: { ...identity, etag: "old" },
      update: { etag: "old" },
    });

    await expect(
      importTournaments(2092, 2092, {
        db,
        tba: {
          async getTournaments() {
            return {
              modified: true,
              data: [
                {
                  ...tournament(`${fixture}-failed`, 2092),
                  parent_event_key: `${fixture}-missing`,
                },
              ],
              etag: "new",
              lastModified: null,
            };
          },
        },
      }),
    ).rejects.toThrow();

    expect(
      await db.tournament.count({ where: { key: `${fixture}-failed` } }),
    ).toBe(0);
    expect(await db.season.findUnique({ where: { year: 2092 } })).toBeNull();
    expect(
      (
        await db.fetchState.findUniqueOrThrow({
          where: { provider_resourceKey: identity },
        })
      ).etag,
    ).toBe("old");
  },
);

test("rejects invalid year ranges before loading clients", async () => {
  await expect(importTournaments(2026, 2025)).rejects.toThrow("ascending");
  await expect(importTournaments(1991, 2026)).rejects.toThrow("1992");
});
