import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { importAllTeams } from "../src/jobs/teams";
import type { TbaTeam } from "../src/providers/tba";

const enabled = process.env.LOVAT_DB_TEST === "1";
let db: PrismaClient;
const teamNumber = 1_000_000 + Math.floor(Math.random() * 1_000_000);
const resourceKeys = [0, 1, 2].map((page) => `teams/${page}/simple`);
const team = (number: number, nickname: string | null): TbaTeam => ({
  key: `frc${number}`,
  team_number: number,
  nickname,
  name: "Official name",
  city: null,
  state_prov: null,
  country: null,
});

beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/missing",
  );
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
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
    await db.team.deleteMany({
      where: { number: { in: [teamNumber, teamNumber + 1] } },
    });
    await db.fetchState.deleteMany({
      where: { provider: "tba", resourceKey: { in: resourceKeys } },
    });
  } finally {
    await db.$disconnect();
  }
});

test.skipIf(!enabled)(
  "imports through the final page, crosses empty pages and reuses validators",
  async () => {
    const pages: number[] = [];
    let cached = false;
    const tba = {
      async getStatus() {
        return {
          modified: true as const,
          data: { max_team_page: 2 },
          etag: null,
          lastModified: null,
        };
      },
      async getTeamsPage(page: number, options?: { etag?: string | null }) {
        pages.push(page);
        if (cached) {
          expect(options?.etag).toBe(`page-${page}`);
          return {
            modified: false as const,
            etag: `page-${page}`,
            lastModified: null,
          };
        }
        return {
          modified: true as const,
          etag: `page-${page}`,
          lastModified: null,
          data:
            page === 0
              ? []
              : [team(teamNumber + page - 1, page === 1 ? "Nickname" : null)],
        };
      },
    };
    await importAllTeams({ db, tba });
    expect(pages).toEqual([0, 1, 2]);
    expect(
      (await db.team.findUniqueOrThrow({ where: { number: teamNumber } })).name,
    ).toBe("Nickname");
    expect(
      (await db.team.findUniqueOrThrow({ where: { number: teamNumber + 1 } }))
        .name,
    ).toBe("Official name");
    cached = true;
    pages.length = 0;
    await importAllTeams({ db, tba });
    expect(pages).toEqual([0, 1, 2]);
  },
);

test.skipIf(!enabled)(
  "a failed page rolls back team changes and retains the previous ETag",
  async () => {
    await db.team.upsert({
      where: { number: teamNumber },
      create: { number: teamNumber, name: "Original" },
      update: { name: "Original" },
    });
    const identity = { provider: "tba", resourceKey: resourceKeys[0]! };
    await db.fetchState.upsert({
      where: { provider_resourceKey: identity },
      create: { ...identity, etag: "old" },
      update: { etag: "old" },
    });
    await expect(
      importAllTeams({
        db,
        tba: {
          async getStatus() {
            return {
              modified: true,
              data: { max_team_page: 0 },
              etag: null,
              lastModified: null,
            };
          },
          async getTeamsPage() {
            // The second team exceeds PostgreSQL's Int range, after the first write.
            return {
              modified: true,
              data: [team(teamNumber, "Changed"), team(2 ** 40, "Invalid")],
              etag: "new",
              lastModified: null,
            };
          },
        },
      }),
    ).rejects.toThrow();
    expect(
      (await db.team.findUniqueOrThrow({ where: { number: teamNumber } })).name,
    ).toBe("Original");
    expect(
      (
        await db.fetchState.findUniqueOrThrow({
          where: { provider_resourceKey: identity },
        })
      ).etag,
    ).toBe("old");
  },
);
