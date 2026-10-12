import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authFixture = vi.hoisted(() => ({
  signToken: null as
    | null
    | ((
        subject: string,
        overrides?: { issuer?: string; audience?: string; expires?: string },
      ) => Promise<string>),
  jwksRequests: 0,
}));

vi.mock("axios", () => ({
  default: {
    get: vi
      .fn()
      .mockRejectedValue(
        new Error("Outbound Auth0 user-info is disabled in tests"),
      ),
  },
}));

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  const { publicKey, privateKey } = await actual.generateKeyPair("RS256");
  const jwk = {
    ...(await actual.exportJWK(publicKey)),
    alg: "RS256",
    use: "sig",
    kid: "test-key",
  };
  authFixture.signToken = (subject, overrides = {}) =>
    new actual.SignJWT({ sub: subject })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuedAt()
      .setIssuer(overrides.issuer ?? "https://auth.test.invalid/")
      .setAudience(overrides.audience ?? "https://api.lovat.app")
      .setExpirationTime(overrides.expires ?? "1h")
      .sign(privateKey);
  return {
    ...actual,
    createRemoteJWKSet: (url: URL) =>
      actual.createRemoteJWKSet(url, {
        [actual.customFetch]: async () => {
          authFixture.jwksRequests++;
          return new Response(JSON.stringify({ keys: [jwk] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      }),
  };
});

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
const leadUserId = randomUUID();
const otherUserId = randomUUID();
const otherTeamNumber = teamNumber - 1;
const robotTeamNumber = teamNumber - 2;
const otherScouterUuid = randomUUID();

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
  teamNumber: robotTeamNumber,
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
      emailVerified: true,
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
      teamSourceRule: { mode: "INCLUDE", items: [teamNumber] },
      tournamentSourceRule: { mode: "INCLUDE", items: [tournamentKey] },
    },
  });
  await db.user.create({
    data: {
      id: leadUserId,
      email: `${leadUserId}@example.invalid`,
      teamNumber,
      role: "SCOUTING_LEAD",
      teamSourceRule: { mode: "INCLUDE", items: [teamNumber] },
      tournamentSourceRule: { mode: "INCLUDE", items: [tournamentKey] },
    },
  });
  await db.team.create({
    data: { number: otherTeamNumber, name: "Other synthetic test team" },
  });
  await db.registeredTeam.create({
    data: {
      number: otherTeamNumber,
      code: `other-${fixtureId}`,
      email: `other-${fixtureId}@example.invalid`,
      emailVerified: true,
    },
  });
  await db.scouter.create({
    data: {
      uuid: otherScouterUuid,
      sourceTeamNumber: otherTeamNumber,
      name: "Other test scouter",
    },
  });
  await db.user.create({
    data: {
      id: otherUserId,
      email: `${otherUserId}@example.invalid`,
      teamNumber: otherTeamNumber,
      role: "SCOUTING_LEAD",
      teamSourceRule: { mode: "INCLUDE", items: [otherTeamNumber] },
      tournamentSourceRule: { mode: "INCLUDE", items: [tournamentKey] },
    },
  });
  await db.tournament.create({
    data: { key: tournamentKey, name: "Synthetic tournament" },
  });
  await db.team.create({
    data: { number: robotTeamNumber, name: "Synthetic report robot" },
  });

  await db.teamMatchData.create({
    data: {
      key: matchKey,
      tournamentKey,
      matchNumber: 1,
      teamNumber: robotTeamNumber,
      matchType: "QUALIFICATION",
    },
  });
});

afterAll(async () => {
  await db.team.deleteMany({ where: { number: teamNumber } });
  await db.team.deleteMany({ where: { number: otherTeamNumber } });
  await db.tournament.deleteMany({ where: { key: tournamentKey } });
  await db.team.deleteMany({ where: { number: robotTeamNumber } });

  await kv.del([`auth:team:${teamNumber}`, `auth:team:${otherTeamNumber}`]);
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
        teamDependencies: [robotTeamNumber],
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

describe.sequential("authenticated report access", () => {
  const otherReportUuid = randomUUID();
  const ownDeleteUuid = randomUUID();

  beforeAll(async () => {
    const otherUpload = await request(app)
      .post("/v1/manager/scoutreports")
      .send({ ...report(otherReportUuid), scouterUuid: otherScouterUuid });
    expect(otherUpload.status).toBe(200);
    const ownUpload = await request(app)
      .post("/v1/manager/scoutreports")
      .send(report(ownDeleteUuid));
    expect(ownUpload.status).toBe(200);
  });

  it("rejects absent, invalid, expired, wrong-issuer, and wrong-audience JWTs", async () => {
    const path = `/v1/manager/scoutreports/${reportUuid}`;
    expect((await request(app).get(path)).status).toBe(401);
    expect(
      (await request(app).get(path).set("Authorization", "Bearer not-a-jwt"))
        .status,
    ).toBe(401);
    for (const overrides of [
      { expires: "-1h" },
      { issuer: "https://wrong-issuer.invalid/" },
      { audience: "https://wrong-audience.invalid" },
    ]) {
      const token = await authFixture.signToken!(userId, overrides);
      expect(
        (await request(app).get(path).set("Authorization", `Bearer ${token}`))
          .status,
      ).toBe(401);
    }
    expect(authFixture.jwksRequests).toBeGreaterThan(0);
  });

  it("limits report reads to the caller's source-team rule", async () => {
    const analystToken = await authFixture.signToken!(userId);
    const own = await request(app)
      .get(`/v1/manager/scoutreports/${reportUuid}`)
      .set("Authorization", `Bearer ${analystToken}`);
    expect(own.status).toBe(200);
    expect(own.body.scoutReport.notes).toBe("Synthetic integration report");
    expect(own.body.canModify).toBe(false);

    const other = await request(app)
      .get(`/v1/manager/scoutreports/${otherReportUuid}`)
      .set("Authorization", `Bearer ${analystToken}`);
    expect(other.status).toBe(404);

    const otherLeadToken = await authFixture.signToken!(otherUserId);
    const otherOwn = await request(app)
      .get(`/v1/manager/scoutreports/${otherReportUuid}`)
      .set("Authorization", `Bearer ${otherLeadToken}`);
    expect(otherOwn.status).toBe(200);
    expect(otherOwn.body.canModify).toBe(true);
    expect(otherOwn.body.scoutReport.scouterName).toBe("Other test scouter");
  });

  it("hides notes, metrics, and events on analysis routes outside source rules", async () => {
    const analystToken = await authFixture.signToken!(userId);
    const routes = [
      `/v1/analysis/metrics/scoutreport/${otherReportUuid}`,
      `/v1/analysis/timeline/scoutreport/${otherReportUuid}`,
    ];
    for (const route of routes) {
      const response = await request(app)
        .get(route)
        .set("Authorization", `Bearer ${analystToken}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(route.includes("timeline") ? [] : {});
    }

    const otherLeadToken = await authFixture.signToken!(otherUserId);
    const visibleTimeline = await request(app)
      .get(routes[1])
      .set("Authorization", `Bearer ${otherLeadToken}`);
    expect(visibleTimeline.status).toBe(200);
    expect(visibleTimeline.body).toHaveLength(3);
  });

  it("denies reads when either source allowlist is empty", async () => {
    const token = await authFixture.signToken!(userId);
    const path = `/v1/manager/scoutreports/${reportUuid}`;
    try {
      await db.user.update({
        where: { id: userId },
        data: { teamSourceRule: { mode: "INCLUDE", items: [] } },
      });
      expect(
        (await request(app).get(path).set("Authorization", `Bearer ${token}`))
          .status,
      ).toBe(404);

      await db.user.update({
        where: { id: userId },
        data: {
          teamSourceRule: { mode: "INCLUDE", items: [teamNumber] },
          tournamentSourceRule: { mode: "INCLUDE", items: [] },
        },
      });
      expect(
        (await request(app).get(path).set("Authorization", `Bearer ${token}`))
          .status,
      ).toBe(404);
    } finally {
      await db.user.update({
        where: { id: userId },
        data: {
          teamSourceRule: { mode: "INCLUDE", items: [teamNumber] },
          tournamentSourceRule: { mode: "INCLUDE", items: [tournamentKey] },
        },
      });
    }
  });

  it("rejects another team's delete and API-key deletion", async () => {
    const otherLeadToken = await authFixture.signToken!(otherUserId);
    const crossTeam = await request(app)
      .delete(`/v1/manager/scoutreports/${reportUuid}`)
      .set("Authorization", `Bearer ${otherLeadToken}`);
    expect(crossTeam.status).toBe(403);

    const apiKey = "lvt-lvt256-delete-fixture";
    // Precomputed SHA-256 digest for this synthetic API key, matching lookup behavior.
    const keyHash =
      "b9097b70e689f08848daea9afd7c4026828ea79a81648703a41eee94f8a1d53c";
    await db.apiKey.create({
      data: { keyHash, name: "Delete test key", userId: leadUserId },
    });
    try {
      const apiDelete = await request(app)
        .delete(`/v1/manager/scoutreports/${reportUuid}`)
        .set("Authorization", `Bearer ${apiKey}`);
      expect(apiDelete.status).toBe(403);
      expect(
        await db.scoutReport.findUnique({ where: { uuid: reportUuid } }),
      ).not.toBeNull();
    } finally {
      await kv.del(`auth:apikey:${keyHash}:rate`);
    }
  });

  it("lets a scouting lead delete their own report and its events", async () => {
    const leadToken = await authFixture.signToken!(leadUserId);
    const response = await request(app)
      .delete(`/v1/manager/scoutreports/${ownDeleteUuid}`)
      .set("Authorization", `Bearer ${leadToken}`);
    expect(response.status).toBe(200);
    expect(
      await db.scoutReport.findUnique({ where: { uuid: ownDeleteUuid } }),
    ).toBeNull();
    expect(
      await db.event.count({ where: { scoutReportUuid: ownDeleteUuid } }),
    ).toBe(0);
    expect(
      (
        await request(app)
          .get(`/v1/manager/scoutreports/${ownDeleteUuid}`)
          .set("Authorization", `Bearer ${leadToken}`)
      ).status,
    ).toBe(404);
  });
});
