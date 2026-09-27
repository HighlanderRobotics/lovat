import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost/missing");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  databaseUrl.pathname !== "/lovat_test" ||
  !["localhost", "127.0.0.1"].includes(redisUrl.hostname) ||
  redisUrl.pathname !== "/15"
) {
  throw new Error(
    "Integration tests require local lovat_test PostgreSQL and Redis database 15",
  );
}

process.env.AUTH0_DOMAIN = "auth.test.invalid";
process.env.DOTENV_CONFIG_PATH = "/dev/null";

const { db } = await import("@lovat/db");
const { app } = await import("../src/app.js");
const { closeRedis, kv } = await import("../src/redisClient.js");

const fixtureId = randomUUID();
const teamNumber = -Math.floor(Math.random() * 1_000_000_000) - 1;
const tournamentKey = `test-${fixtureId}`;
const matchKey = `test-match-${fixtureId}`;
const scouterUuid = randomUUID();
const reportUuid = randomUUID();
const userId = randomUUID();

const report = (uuid: string) => ({
  uuid,
  tournamentKey,
  matchType: "QUALIFICATION",
  matchNumber: 1,
  startTime: Date.UTC(2026, 0, 1),
  notes: "Synthetic integration report",
  robotRoles: ["SCORING"],
  mobility: "NONE",
  beached: "NEITHER",
  feederTypes: [],
  intakeType: "NEITHER",
  driverAbility: 3,
  accuracy: null,
  disrupts: false,
  defenseEffectiveness: 0,
  scoresWhileMoving: false,
  autoClimb: "NOT_ATTEMPTED",
  endgameClimb: "NOT_ATTEMPTED",
  scouterUuid,
  teamNumber: 9999,
  events: [
    [0, 2, 8],
    [10, 0, 2],
    [20, 1, 2, 3],
  ],
});

beforeAll(async () => {
  await db.team.create({
    data: { number: teamNumber, name: "Synthetic test team" },
  });
  await db.registeredTeam.create({
    data: {
      number: teamNumber,
      code: fixtureId,
      email: `${fixtureId}@example.invalid`,
    },
  });
  await db.scouter.create({
    data: {
      uuid: scouterUuid,
      sourceTeamNumber: teamNumber,
      name: "Test scouter",
    },
  });
  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@example.invalid`,
      teamNumber,
      role: "ANALYST",
    },
  });
  await db.tournament.create({
    data: { key: tournamentKey, name: "Synthetic tournament" },
  });
  await db.teamMatchData.create({
    data: {
      key: matchKey,
      tournamentKey,
      matchNumber: 1,
      teamNumber: 9999,
      matchType: "QUALIFICATION",
    },
  });
});

afterAll(async () => {
  await db.team.deleteMany({ where: { number: teamNumber } });
  await db.tournament.deleteMany({ where: { key: tournamentKey } });
  await closeRedis();
  await db.$disconnect();
});

describe.sequential("report upload against disposable services", () => {
  it("persists the report and scoring event", async () => {
    const response = await request(app)
      .post("/v1/manager/scoutreports")
      .send(report(reportUuid));
    expect(response.status).toBe(200);
    const stored = await db.scoutReport.findUniqueOrThrow({
      where: { uuid: reportUuid },
      include: { events: true },
    });
    expect(stored.events).toHaveLength(3);
    expect(
      stored.events.find((event) => event.action === "STOP_SCORING")?.points,
    ).toBe(3);
  });

  it("rejects duplicate IDs without adding more events", async () => {
    const response = await request(app)
      .post("/v1/manager/scoutreports")
      .send(report(reportUuid));
    expect(response.status).toBe(400);
    expect(
      await db.event.count({ where: { scoutReportUuid: reportUuid } }),
    ).toBe(3);
  });

  it("rejects an invalid event without leaving a partial report", async () => {
    const uuid = randomUUID();
    const response = await request(app)
      .post("/v1/manager/scoutreports")
      .send({ ...report(uuid), events: [[0, 2, 99]] });
    expect(response.status).toBe(400);
    expect(await db.scoutReport.findUnique({ where: { uuid } })).toBeNull();
  });

  it("rejects an unknown scouter without persisting a report", async () => {
    const uuid = randomUUID();
    const response = await request(app)
      .post("/v1/manager/scoutreports")
      .send({ ...report(uuid), scouterUuid: randomUUID() });
    expect(response.status).toBe(400);
    expect(await db.scoutReport.findUnique({ where: { uuid } })).toBeNull();
  });

  it("invalidates matching database and Redis cache entries after an upload", async () => {
    const cacheKey = `test-cache-${randomUUID()}`;
    const uuid = randomUUID();
    await db.cachedAnalysis.create({
      data: {
        key: cacheKey,
        teamDependencies: [9999],
        tournamentDependencies: [],
      },
    });
    await kv.set(cacheKey, "synthetic cached result");
    const response = await request(app)
      .post("/v1/manager/scoutreports")
      .send(report(uuid));
    expect(response.status).toBe(200);
    expect(
      await db.cachedAnalysis.findUnique({ where: { key: cacheKey } }),
    ).toBeNull();
    expect(await kv.get(cacheKey)).toBeNull();
  });

  it("limits repeated API-key requests using disposable Redis", async () => {
    const token = `lvt-${randomUUID()}`;
    const keyHash = createHash("sha256").update(token).digest("hex");
    await db.apiKey.create({
      data: { keyHash, name: "Synthetic test key", userId },
    });
    try {
      const first = await request(app)
        .get("/v1/manager/profile")
        .set("Authorization", `Bearer ${token}`);
      expect(first.status).toBe(200);
      expect(first.body.id).toBe(userId);
      const second = await request(app)
        .get("/v1/manager/profile")
        .set("Authorization", `Bearer ${token}`);
      expect(second.status).toBe(429);
      expect(
        (await db.apiKey.findUniqueOrThrow({ where: { keyHash } })).requests,
      ).toBe(1);
    } finally {
      await kv.del(`auth:apikey:${keyHash}:rate`);
    }
  });
});
