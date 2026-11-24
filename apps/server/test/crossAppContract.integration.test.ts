import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { contractFixtures } from "./helpers/contractFixtures.js";
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
    "Cross-app contracts require local lovat_test PostgreSQL and Redis database 15",
  );
}
process.env.AUTH0_DOMAIN = "auth.test.invalid";
process.env.DOTENV_CONFIG_PATH = "/dev/null";
const { db } = await import("@lovat/db");
const { app } = await import("../src/app.js");
const { closeRedis, kv } = await import("../src/redisClient.js");
const { calculateReportTotalPoints } =
  await import("../src/handler/analysis/reportPoints.js");
const fixture = contractFixtures();
const reports = process.env.LOVAT_CONTRACT_COLLECTION_DIR
  ? JSON.parse(
      readFileSync(
        resolve(
          process.env.LOVAT_CONTRACT_COLLECTION_DIR,
          "collection-payloads.json",
        ),
        "utf8",
      ),
    )
  : fixture.reports;
const robots = [
  fixture.reports.current.teamNumber,
  fixture.reports.secondRobot.teamNumber,
] as number[];
const tournamentKey = fixture.reports.current.tournamentKey as string;
const sources = fixture.sourceTeams as {
  number: number;
  name: string;
  code: string;
  scouterUuid: string;
  scouterName: string;
  userId: string;
  role: "ANALYST" | "SCOUTING_LEAD";
}[];

beforeAll(async () => {
  for (const source of sources) {
    await db.team.create({
      data: { number: source.number, name: source.name },
    });
    await db.registeredTeam.create({
      data: {
        number: source.number,
        code: source.code,
        email: `${source.userId}@example.invalid`,
        emailVerified: true,
      },
    });
    await db.scouter.create({
      data: {
        uuid: source.scouterUuid,
        name: source.scouterName,
        sourceTeamNumber: source.number,
      },
    });
    await db.user.create({
      data: {
        id: source.userId,
        email: `${source.userId}@example.invalid`,
        teamNumber: source.number,
        role: source.role,
        teamSourceRule: { mode: "INCLUDE", items: [source.number] },
        tournamentSourceRule: { mode: "INCLUDE", items: [tournamentKey] },
      },
    });
  }
  await db.tournament.create({
    data: { key: tournamentKey, name: "Synthetic contract tournament" },
  });
  for (const robot of robots) {
    await db.team.create({
      data: { number: robot, name: "Fictional contract robot" },
    });
    await db.teamMatchData.create({
      data: {
        key: `${tournamentKey}_qm1_${robot}`,
        teamNumber: robot,
        tournamentKey,
        matchNumber: 1,
        matchType: "QUALIFICATION",
      },
    });
  }
});
afterAll(async () => {
  const where = {
    OR: [
      { teamDependencies: { hasSome: robots } },
      { tournamentDependencies: { has: tournamentKey } },
    ],
  };
  const rows = await db.cachedAnalysis.findMany({
    where,
    select: { key: true },
  });
  if (rows.length) {
    await kv.del(rows.map((row) => row.key));
  }
  await db.cachedAnalysis.deleteMany({ where });
  await db.user.deleteMany({
    where: { id: { in: sources.map((source) => source.userId) } },
  });
  await db.team.deleteMany({
    where: { number: { in: sources.map((source) => source.number) } },
  });
  await db.tournament.deleteMany({ where: { key: tournamentKey } });
  await db.team.deleteMany({ where: { number: { in: robots } } });
  await closeRedis();
  await db.$disconnect();
});
const upload = (report: object) =>
  request(app)
    .post("/collection/scoutreports")
    .set("X-Lovat-Error-Format", "json-v1")
    .send(report);
async function viewerGet(path: string, sourceIndex: number) {
  const token = await authFixture.signToken!(sources[sourceIndex].userId);
  return request(app)
    .get(path)
    .set("Authorization", `Bearer ${token}`)
    .set("X-Lovat-Error-Format", "json-v1");
}

describe.sequential(
  "retained Collection → Server → Dashboard contracts",
  () => {
    it("persists Collection output and returns independently calculated analysis without cross-team private notes", async () => {
      for (const key of ["current", "secondRobot", "otherSource"]) {
        expect(reports[key]).toEqual(fixture.reports[key]);
        expect((await upload(reports[key])).status).toBe(200);
        const stored = await db.scoutReport.findUniqueOrThrow({
          where: { uuid: reports[key].uuid },
          include: { events: true },
        });
        expect(calculateReportTotalPoints(stored)).toBe(
          fixture.expected.points[key],
        );
      }
      const analysis = await viewerGet(
        `/v1/analysis/picklist?tournamentKey=${tournamentKey}&flags=[]&totalPoints=1`,
        0,
      );
      expect(analysis.status).toBe(200);
      expect(analysis.body).toEqual(fixture.expected.analysis);
      for (const index of [0, 1, 0]) {
        const notes = await viewerGet(
          `/v1/analysis/notes/team/${robots[0]}`,
          index,
        );
        expect(notes.status).toBe(200);
        const marker = index === 0 ? "alpha" : "bravo";
        expect(notes.body.map((row: { notes: string }) => row.notes)).toEqual(
          fixture.expected.visibleNotes[marker],
        );
        expect(JSON.stringify(notes.body)).not.toContain(
          fixture.expected.visibleNotes[index === 0 ? "bravo" : "alpha"][0],
        );
      }
      if (process.env.LOVAT_CONTRACT_OUTPUT_DIR) {
        mkdirSync(process.env.LOVAT_CONTRACT_OUTPUT_DIR, { recursive: true });
        writeFileSync(
          resolve(
            process.env.LOVAT_CONTRACT_OUTPUT_DIR,
            "analysis.actual.json",
          ),
          JSON.stringify(analysis.body, null, 2),
        );
      }
    });
    it("accepts the retained old payload and removes its known orphaned start", async () => {
      expect((await upload(reports.legacy)).status).toBe(200);
      const stored = await db.scoutReport.findUniqueOrThrow({
        where: { uuid: reports.legacy.uuid },
        include: { events: { orderBy: { time: "asc" } } },
      });
      expect(
        stored.events.map((event) => [
          event.time,
          event.action,
          event.quantity,
        ]),
      ).toEqual(fixture.expected.legacyStoredEvents);
    });
    it("rejects malformed current timelines without a partial database write", async () => {
      expect((await upload(fixture.reports.malformed)).status).toBe(400);
      expect(
        await db.scoutReport.findUnique({
          where: { uuid: fixture.reports.malformed.uuid },
        }),
      ).toBeNull();
    });
  },
);
