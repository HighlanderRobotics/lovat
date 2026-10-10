import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { importMatches } from "../src/jobs/matches";
import { refreshTournamentGaps } from "../src/jobs/gaps";
import type { TbaMatch } from "../src/providers/tba";

const enabled = process.env.LOVAT_DB_TEST === "1";
const eventKey = `gaps-${crypto.randomUUID()}`;

let db: PrismaClient;

const matches: TbaMatch[] = [1, 2].map((number) => ({
  key: `${eventKey}_qm${number}`,
  event_key: eventKey,
  comp_level: "qm",
  set_number: 1,
  match_number: number,
  time: Date.parse(`2026-03-06T${number === 1 ? "19" : "20"}:00:00Z`) / 1000,
  actual_time: null,
  predicted_time: null,
  post_result_time: null,
  winning_alliance: "",
  score_breakdown: null,
  alliances: {
    red: {
      team_keys: [],
      score: -1,
      dq_team_keys: [],
      surrogate_team_keys: [],
    },
    blue: {
      team_keys: [],
      score: -1,
      dq_team_keys: [],
      surrogate_team_keys: [],
    },
  },
}));

const tba = {
  async getMatchEvent() {
    return {
      modified: true as const,
      data: { key: eventKey, playoff_type: 10, remap_teams: null },
      etag: "event",
      lastModified: null,
    };
  },
  async getMatches() {
    return {
      modified: true as const,
      data: matches,
      etag: "matches",
      lastModified: null,
    };
  },
};

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

  await db.tournament.create({
    data: {
      key: eventKey,
      name: "Gap fixture",
      timezone: "America/Los_Angeles",
    },
  });
});

afterAll(async () => {
  if (!db) return;

  try {
    await db.tournament.delete({ where: { key: eventKey } });
    await db.fetchState.deleteMany({
      where: {
        provider: "tba",
        resourceKey: { startsWith: `event/${eventKey}/` },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test.skipIf(!enabled)(
  "match imports commit gaps and cached responses backfill them idempotently",
  async () => {
    await importMatches(eventKey, { db, tba });

    const gap = await db.tournamentGap.findFirstOrThrow({
      where: { tournamentKey: eventKey },
    });
    expect(gap.type).toBe("LUNCH");
    expect(gap.timingSource).toBe("SCHEDULED");

    await db.tournamentGap.deleteMany({ where: { tournamentKey: eventKey } });

    const cached = {
      ...tba,
      async getMatches() {
        return {
          modified: false as const,
          etag: "matches",
          lastModified: null,
        };
      },
    };

    await importMatches(eventKey, { db, tba: cached });
    await refreshTournamentGaps(eventKey, { db });
    expect(
      await db.tournamentGap.count({ where: { tournamentKey: eventKey } }),
    ).toBe(1);
  },
);

test.skipIf(!enabled)(
  "failed imports preserve gaps and actual corrections remove stale gaps",
  async () => {
    const prior = await db.tournamentGap.findFirstOrThrow({
      where: { tournamentKey: eventKey },
    });

    await expect(
      importMatches(eventKey, {
        db,
        tba: {
          ...tba,
          async getMatches() {
            return {
              modified: true as const,
              data: [
                { ...matches[0]!, time: matches[0]!.time! - 3600 },
                { ...matches[1]!, event_key: "wrong-event" },
              ],
              etag: "bad",
              lastModified: null,
            };
          },
        },
      }),
    ).rejects.toThrow("belong");

    expect(
      await db.tournamentGap.findFirstOrThrow({
        where: { tournamentKey: eventKey },
      }),
    ).toEqual(prior);

    matches[0]!.actual_time = matches[0]!.time;
    matches[1]!.actual_time = matches[0]!.time! + 600;

    await importMatches(eventKey, { db, tba });
    expect(
      await db.tournamentGap.count({ where: { tournamentKey: eventKey } }),
    ).toBe(0);
  },
);

test.skipIf(!enabled)(
  "database rejects inverted intervals and cascades gaps with boundary matches",
  async () => {
    const data = {
      tournamentKey: eventKey,
      afterMatchKey: matches[0]!.key,
      beforeMatchKey: matches[1]!.key,
      type: "BREAK" as const,
      timingSource: "ACTUAL" as const,
      startTime: new Date("2026-03-06T19:03:00Z"),
      endTime: new Date("2026-03-06T20:00:00Z"),
    };

    await expect(
      Promise.resolve(
        db.tournamentGap.create({ data: { ...data, endTime: data.startTime } }),
      ),
    ).rejects.toThrow();
    await expect(
      Promise.resolve(
        db.tournamentGap.create({
          data: { ...data, beforeMatchKey: data.afterMatchKey },
        }),
      ),
    ).rejects.toThrow();
    await db.tournamentGap.create({ data });
    await db.match.delete({ where: { key: matches[1]!.key } });

    expect(
      await db.tournamentGap.count({ where: { tournamentKey: eventKey } }),
    ).toBe(0);
  },
);

test("gap backfills reject empty tournament keys before loading clients", async () => {
  await expect(refreshTournamentGaps(" ")).rejects.toThrow("required");
});
