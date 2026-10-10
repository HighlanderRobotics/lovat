import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { importMatches } from "../src/jobs/matches";
import type { TbaMatch } from "../src/providers/tba";

const enabled = process.env.LOVAT_DB_TEST === "1";
const eventKey = `match-fixture-${crypto.randomUUID()}`;
const teamNumber = 3_000_000 + Math.floor(Math.random() * 1_000_000);

let db: PrismaClient;
let reportId: string;

const match = (suffix = "qm1"): TbaMatch => ({
  key: `${eventKey}_${suffix}`,
  event_key: eventKey,
  comp_level: "qm",
  set_number: 1,
  match_number: 1,
  time: 1_770_000_000,
  predicted_time: null,
  actual_time: null,
  post_result_time: null,
  winning_alliance: "",
  alliances: {
    red: {
      team_keys: [`frc${teamNumber}B`],
      score: -1,
      dq_team_keys: [],
      surrogate_team_keys: [`frc${teamNumber}B`],
    },
    blue: {
      team_keys: [`frc${teamNumber + 1}`],
      score: -1,
      dq_team_keys: [],
      surrogate_team_keys: [],
    },
  },
  score_breakdown: null,
});

function provider(
  data: TbaMatch[],
  eventEtag = "event-v1",
  matchEtag = "matches-v1",
) {
  return {
    async getMatchEvent() {
      return {
        modified: true as const,
        data: {
          key: eventKey,
          playoff_type: 10,
          remap_teams: { [`frc${teamNumber}`]: `frc${teamNumber}B` },
        },
        etag: eventEtag,
        lastModified: null,
      };
    },

    async getMatches() {
      return {
        modified: true as const,
        data,
        etag: matchEtag,
        lastModified: null,
      };
    },
  };
}

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

  await db.tournament.create({
    data: { key: eventKey, name: "Match fixture" },
  });
  await db.team.create({ data: { number: teamNumber, name: "Original name" } });
  await db.teamMatchData.create({
    data: {
      key: `${eventKey}_qm1_0`,
      tournamentKey: eventKey,
      teamNumber,
      matchType: "QUALIFICATION",
      matchNumber: 1,
    },
  });

  const scouter = await db.scouter.create({
    data: {
      sourceTeam: {
        create: {
          number: teamNumber,
          code: crypto.randomUUID(),
          email: "fixture@example.invalid",
        },
      },
    },
  });

  const report = await db.scoutReport.create({
    data: {
      teamMatchKey: `${eventKey}_qm1_0`,
      scouterUuid: scouter.uuid,
      startTime: new Date(),
      notes: "Fixture report",
      robotRoles: [],
      driverAbility: 0,
      beached: "NEITHER",
      defenseEffectiveness: 0,
      feederTypes: [],
      intakeType: "NEITHER",
      fieldTraversal: "NONE",
      scoresWhileMoving: false,
      disrupts: false,
      endgameClimb: "NOT_ATTEMPTED",
      autoClimb: "NOT_ATTEMPTED",
    },
  });

  reportId = report.uuid;
});

afterAll(async () => {
  if (!db) return;

  try {
    await db.tournament.delete({ where: { key: eventKey } });
    await db.team.deleteMany({
      where: { number: { in: [teamNumber, teamNumber + 1] } },
    });
    await db.fetchState.deleteMany({
      where: {
        provider: "tba",
        resourceKey: {
          in: [
            `event/${eventKey}/matches?dependency=event`,
            `event/${eventKey}/matches`,
          ],
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test.skipIf(!enabled)(
  "imports remapped participants, preserves scouting links and updates results idempotently",
  async () => {
    const qualification = match();
    const final = { ...match("f1m1"), comp_level: "f" as const };
    const practice = { ...match("pm1"), comp_level: "pm" as const };

    await importMatches(eventKey, {
      db,
      tba: provider([final, practice, qualification]),
    });

    const slot = await db.teamMatchData.findUniqueOrThrow({
      where: { key: `${eventKey}_qm1_0` },
      include: { scoutReports: true },
    });
    expect(slot.matchKey).toBe(qualification.key);
    expect(slot.externalParticipantKey).toBe(`frc${teamNumber}B`);
    expect(slot.surrogate).toBe(true);
    expect(slot.scoutReports[0]?.uuid).toBe(reportId);
    expect(
      (await db.team.findUniqueOrThrow({ where: { number: teamNumber } })).name,
    ).toBe("Original name");
    expect(
      (
        await db.teamMatchData.findUniqueOrThrow({
          where: { key: `${eventKey}_em14_0` },
        })
      ).matchKey,
    ).toBe(final.key);
    expect(
      await db.match.findUnique({ where: { key: practice.key } }),
    ).toBeNull();

    qualification.alliances.red.score = 100;
    qualification.alliances.blue.score = 90;
    qualification.winning_alliance = "red";
    qualification.score_breakdown = {
      red: { totalPoints: 100, nested: { auto: 20 } },
      blue: { totalPoints: 90 },
    };

    await importMatches(eventKey, {
      db,
      tba: provider([qualification, final], "event-v1", "matches-v2"),
    });

    const saved = await db.match.findUniqueOrThrow({
      where: { key: qualification.key },
      include: { alliances: true },
    });
    expect(saved.status).toBe("COMPLETED");
    expect(saved.winningAlliance).toBe("RED");
    expect(saved.scheduledTime?.toISOString()).toBe(
      new Date(qualification.time! * 1000).toISOString(),
    );
    expect(
      saved.alliances.find((alliance) => alliance.color === "RED")
        ?.scoreBreakdown,
    ).toEqual(qualification.score_breakdown.red);
    expect(await db.match.count({ where: { tournamentKey: eventKey } })).toBe(
      2,
    );
    expect(
      await db.teamMatchData.count({ where: { tournamentKey: eventKey } }),
    ).toBe(4);
  },
);

test.skipIf(!enabled)(
  "reuses match validators only when event metadata is unchanged",
  async () => {
    const before = await db.tournament.findUniqueOrThrow({
      where: { key: eventKey },
    });
    const tba = {
      ...provider([]),
      async getMatches(_key: string, options?: { etag?: string | null }) {
        expect(options?.etag).toBe("matches-v2");
        return {
          modified: false as const,
          etag: "matches-v2",
          lastModified: null,
        };
      },
    };

    await importMatches(eventKey, { db, tba });
    expect(
      (await db.tournament.findUniqueOrThrow({ where: { key: eventKey } }))
        .officialDataRevision,
    ).toBe(before.officialDataRevision);

    await importMatches(eventKey, {
      db,
      tba: {
        ...provider([match()], "event-v2"),
        async getMatches(_key, options) {
          expect(options?.etag).toBeUndefined();
          return provider([match()], "event-v2", "matches-v3").getMatches();
        },
      },
    });
  },
);

test.skipIf(!enabled)(
  "participant changes with reports roll back results and cache headers",
  async () => {
    const before = await db.tournament.findUniqueOrThrow({
      where: { key: eventKey },
    });
    const changed = match();
    changed.alliances.red.team_keys = [`frc${teamNumber + 1}`];

    await expect(
      importMatches(eventKey, {
        db,
        tba: provider([changed], "event-v3", "bad"),
      }),
    ).rejects.toThrow("reconciliation");

    expect(
      (
        await db.teamMatchData.findUniqueOrThrow({
          where: { key: `${eventKey}_qm1_0` },
        })
      ).teamNumber,
    ).toBe(teamNumber);
    expect(
      await db.scoutReport.findUnique({ where: { uuid: reportId } }),
    ).not.toBeNull();
    expect(
      (
        await db.fetchState.findUniqueOrThrow({
          where: {
            provider_resourceKey: {
              provider: "tba",
              resourceKey: `event/${eventKey}/matches`,
            },
          },
        })
      ).etag,
    ).toBe("matches-v3");
    expect(
      (await db.tournament.findUniqueOrThrow({ where: { key: eventKey } }))
        .officialDataRevision,
    ).toBe(before.officialDataRevision);

    changed.alliances.red.team_keys = [];
    await expect(
      importMatches(eventKey, {
        db,
        tba: provider([changed], "event-v3", "bad"),
      }),
    ).rejects.toThrow("reconciliation");
  },
);

test("rejects empty tournament keys before loading clients", async () => {
  await expect(importMatches(" ")).rejects.toThrow("required");
});
