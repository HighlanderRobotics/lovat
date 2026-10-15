import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { importTeamSeasons } from "../src/jobs/team-seasons";
import { importDistricts, importDistrictTeams } from "../src/jobs/districts";
import { importTournamentTeams } from "../src/jobs/tournament-teams";
import type { TbaTeam } from "../src/providers/tba";

const enabled = process.env.LOVAT_DB_TEST === "1";
const fixture = crypto.randomUUID();
const year = 2093;
const number = 5_000_000 + Math.floor(Math.random() * 1_000_000);
const eventKey = `${fixture}-event`;
const districtKey = `${fixture}-district`;

let db: PrismaClient;

const team = (teamNumber = number): TbaTeam => ({
  key: `frc${teamNumber}`,
  team_number: teamNumber,
  name: "Official name",
  nickname: "Season name",
  city: "San Jose",
  state_prov: "CA",
  country: "USA",
});
const response = <T>(data: T, etag = "v1") => ({
  modified: true as const,
  data,
  etag,
  lastModified: null,
});

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

  await db.team.create({ data: { number, name: "Current global name" } });
});

afterAll(async () => {
  if (!db) return;

  try {
    await db.tournament.deleteMany({ where: { key: eventKey } });
    await db.teamSeason.deleteMany({
      where: { teamNumber: { in: [number, number + 1] }, seasonYear: year },
    });
    await db.districtSeason.deleteMany({ where: { key: districtKey } });
    await db.team.deleteMany({
      where: { number: { in: [number, number + 1] } },
    });
    await db.season.deleteMany({
      where: {
        year,
        tournaments: { none: {} },
        teamSeasons: { none: {} },
        districtSeasons: { none: {} },
      },
    });
    await db.fetchState.deleteMany({
      where: {
        provider: "tba",
        OR: [
          { resourceKey: { contains: fixture } },
          {
            resourceKey: {
              in: [
                `districts/${year}`,
                ...[0, 1, 2].map((page) => `teams/${year}/${page}/simple`),
              ],
            },
          },
        ],
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test.skipIf(!enabled)(
  "imports season pages through empty pages without overwriting global names or memberships",
  async () => {
    const pages: number[] = [];

    await importTeamSeasons(year, {
      db,
      tba: {
        async getStatus() {
          return response({ max_team_page: 2 });
        },
        async getSeasonTeamsPage(requestYear, page) {
          expect(requestYear).toBe(year);
          pages.push(page);
          return response(page === 1 ? [team()] : []);
        },
      },
    });

    expect(pages).toEqual([0, 1, 2]);
    expect((await db.team.findUniqueOrThrow({ where: { number } })).name).toBe(
      "Current global name",
    );
    expect(
      (
        await db.teamSeason.findUniqueOrThrow({
          where: {
            teamNumber_seasonYear: { teamNumber: number, seasonYear: year },
          },
        })
      ).city,
    ).toBe("San Jose");
  },
);

test.skipIf(!enabled)(
  "imports district catalogs and reconciles memberships without deleting season teams",
  async () => {
    await importDistricts(year, {
      db,
      tba: {
        async getDistricts() {
          return response([
            {
              key: districtKey,
              year,
              abbreviation: fixture,
              display_name: "District fixture",
            },
          ]);
        },
      },
    });

    await importDistrictTeams(districtKey, {
      db,
      tba: {
        async getDistrictTeams() {
          return response([team()]);
        },
      },
    });

    expect(
      (
        await db.teamSeason.findUniqueOrThrow({
          where: {
            teamNumber_seasonYear: { teamNumber: number, seasonYear: year },
          },
        })
      ).districtSeasonKey,
    ).toBe(districtKey);

    await importTeamSeasons(year, {
      db,
      tba: {
        async getStatus() {
          return response({ max_team_page: 0 });
        },
        async getSeasonTeamsPage() {
          return response([team()], "updated");
        },
      },
    });

    expect(
      (
        await db.teamSeason.findUniqueOrThrow({
          where: {
            teamNumber_seasonYear: { teamNumber: number, seasonYear: year },
          },
        })
      ).districtSeasonKey,
    ).toBe(districtKey);

    await importDistrictTeams(districtKey, {
      db,
      tba: {
        async getDistrictTeams() {
          return response([], "v2");
        },
      },
    });

    expect(
      (
        await db.teamSeason.findUniqueOrThrow({
          where: {
            teamNumber_seasonYear: { teamNumber: number, seasonYear: year },
          },
        })
      ).districtSeasonKey,
    ).toBeNull();
  },
);

test.skipIf(!enabled)(
  "rosters apply remappings, remove stale memberships and retain match slots",
  async () => {
    await db.tournament.create({
      data: { key: eventKey, name: "Event fixture", seasonYear: year },
    });
    await db.teamMatchData.create({
      data: {
        key: `${eventKey}_qm1_0`,
        tournamentKey: eventKey,
        teamNumber: number,
        matchNumber: 1,
        matchType: "QUALIFICATION",
      },
    });

    const metadata = {
      key: eventKey,
      playoff_type: 10,
      remap_teams: { [`frc${number}`]: `frc${number}B` },
    };
    const tba = {
      async getMatchEvent() {
        return response(metadata);
      },
      async getTournamentTeams() {
        return response([
          { ...team(), key: `frc${number}B` },
          team(number + 1),
        ]);
      },
    };

    await importTournamentTeams(eventKey, { db, tba });
    expect(
      await db.teamTournament.count({ where: { tournamentKey: eventKey } }),
    ).toBe(2);

    await importTournamentTeams(eventKey, {
      db,
      tba: {
        ...tba,
        async getTournamentTeams(_key, options) {
          expect(options?.etag).toBe("v1");
          return response([team(number + 1)], "v2");
        },
      },
    });

    expect(
      await db.teamTournament.count({ where: { tournamentKey: eventKey } }),
    ).toBe(1);
    expect(
      await db.teamMatchData.findUnique({
        where: { key: `${eventKey}_qm1_0` },
      }),
    ).not.toBeNull();

    await expect(
      importTournamentTeams(eventKey, {
        db,
        tba: {
          ...tba,
          async getTournamentTeams() {
            return response(
              [team(number), { ...team(number + 1), key: "unmapped-alias" }],
              "bad",
            );
          },
        },
      }),
    ).rejects.toThrow("mapping");

    expect(
      await db.teamTournament.count({ where: { tournamentKey: eventKey } }),
    ).toBe(1);
    expect(
      (
        await db.fetchState.findUniqueOrThrow({
          where: {
            provider_resourceKey: {
              provider: "tba",
              resourceKey: `event/${eventKey}/teams/simple`,
            },
          },
        })
      ).etag,
    ).toBe("v2");
  },
);

test("rejects invalid seasons and targets before loading clients", async () => {
  await expect(importTeamSeasons(1991)).rejects.toThrow("Season");
  await expect(importDistricts(NaN)).rejects.toThrow("Season");
  await expect(importDistrictTeams("")).rejects.toThrow("required");
  await expect(importTournamentTeams(" ")).rejects.toThrow("required");
});
