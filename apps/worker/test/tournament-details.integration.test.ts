import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { importTournamentDetails } from "../src/jobs/tournament-details";

const enabled = process.env.LOVAT_DB_TEST === "1";
const eventKey = `${crypto.randomUUID()}-details`;
const year = 2095;
const number = 7_000_000 + Math.floor(Math.random() * 100_000);
let db: PrismaClient;
const fresh = <T>(data: T) => ({
  modified: true as const,
  data,
  etag: "details-v1",
  lastModified: null,
});
const unchanged = () => ({
  modified: false as const,
  etag: "details-v1",
  lastModified: null,
});
const image =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=";
const tba = {
  getMatchEvent: async () =>
    fresh({
      key: eventKey,
      playoff_type: 10,
      remap_teams: { [`frc${number}`]: "alias" },
    }),
  getSelections: async () =>
    fresh([
      { picks: ["alias"], backup: { in: `frc${number + 1}`, out: "alias" } },
    ]),
  getAwards: async () =>
    fresh([
      {
        event_key: eventKey,
        award_type: 1,
        name: "Winner",
        recipient_list: [{ team_key: "alias", awardee: null }],
      },
    ]),
  getTeamMedia: async () =>
    fresh([
      { type: "avatar", preferred: true, details: { base64Image: image } },
    ]),
};

beforeAll(async () => {
  if (!enabled) return;

  const url = new URL(process.env.DATABASE_URL!);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lovat_test"
  )
    throw new Error("Use a disposable local lovat_test database");

  const { createDb } = await import("@lovat/db");
  db = createDb(url.href);
  await db.season.upsert({ where: { year }, update: {}, create: { year } });
  await db.team.create({ data: { number, name: "Fixture" } });
  await db.teamSeason.create({
    data: { teamNumber: number, seasonYear: year, name: "Fixture" },
  });
  await db.tournament.create({
    data: {
      key: eventKey,
      name: "Fixture",
      seasonYear: year,
      teams: { create: { teamNumber: number } },
    },
  });
});

afterAll(async () => {
  if (!db) return;

  await db.tournament.delete({ where: { key: eventKey } });
  await db.teamSeason.deleteMany({ where: { teamNumber: number } });
  await db.team.delete({ where: { number } });
  await db.fetchState.deleteMany({
    where: {
      provider: "tba",
      OR: [
        { resourceKey: { contains: eventKey } },
        { resourceKey: `team/frc${number}/media/${year}` },
      ],
    },
  });
  await db.season.deleteMany({
    where: { year, tournaments: { none: {} }, teamSeasons: { none: {} } },
  });
  await db.$disconnect();
});

test.skipIf(!enabled)(
  "imports selections, remapped awards, backups and avatars; cached responses preserve them",
  async () => {
    await importTournamentDetails(eventKey, { db, tba });

    const event = await db.tournament.findUniqueOrThrow({
      where: { key: eventKey },
    });
    expect(event.allianceSelections).toEqual([
      { teams: [number], backup: { in: number + 1, out: number } },
    ]);
    expect(event.awards).toEqual([
      {
        type: 1,
        name: "Winner",
        recipients: [{ teamNumber: number, name: null }],
      },
    ]);
    expect(
      (
        await db.teamSeason.findUniqueOrThrow({
          where: {
            teamNumber_seasonYear: { teamNumber: number, seasonYear: year },
          },
        })
      ).avatar,
    ).toBe(`data:image/png;base64,${image}`);

    await importTournamentDetails(eventKey, {
      db,
      tba: {
        ...tba,
        getSelections: async () => unchanged(),
        getAwards: async () => unchanged(),
        getTeamMedia: async () => unchanged(),
      },
    });
    expect(
      (await db.tournament.findUniqueOrThrow({ where: { key: eventKey } }))
        .allianceSelections,
    ).toEqual(event.allianceSelections);
  },
);

test.skipIf(!enabled)(
  "rolls back selections and cache validators when award validation fails",
  async () => {
    const before = await db.tournament.findUniqueOrThrow({
      where: { key: eventKey },
    });

    await expect(
      importTournamentDetails(eventKey, {
        db,
        tba: {
          ...tba,
          getSelections: async () => ({ ...fresh([]), etag: "bad-v2" }),
          getAwards: async () =>
            fresh([
              {
                event_key: "wrong-event",
                award_type: 1,
                name: "Wrong",
                recipient_list: [],
              },
            ]),
        },
      }),
    ).rejects.toThrow("Award event mismatch");
    expect(
      (await db.tournament.findUniqueOrThrow({ where: { key: eventKey } }))
        .allianceSelections,
    ).toEqual(before.allianceSelections);
    expect(
      (
        await db.fetchState.findUniqueOrThrow({
          where: {
            provider_resourceKey: {
              provider: "tba",
              resourceKey: `event/${eventKey}/alliances`,
            },
          },
        })
      ).etag,
    ).toBe("details-v1");
  },
);

test.skipIf(!enabled)(
  "clears withdrawn selections, awards and avatars on fresh empty responses",
  async () => {
    await importTournamentDetails(eventKey, {
      db,
      tba: {
        ...tba,
        getSelections: async () => fresh([]),
        getAwards: async () => fresh([]),
        getTeamMedia: async () => fresh([]),
      },
    });

    const event = await db.tournament.findUniqueOrThrow({
      where: { key: eventKey },
    });
    expect(event.allianceSelections).toEqual([]);
    expect(event.awards).toEqual([]);
    expect(
      (
        await db.teamSeason.findUniqueOrThrow({
          where: {
            teamNumber_seasonYear: { teamNumber: number, seasonYear: year },
          },
        })
      ).avatar,
    ).toBeNull();
  },
);
