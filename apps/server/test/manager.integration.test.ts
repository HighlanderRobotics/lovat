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
const otherTeamNumber = teamNumber - 1;
const unverifiedTeamNumber = teamNumber - 2;
const robotTeamNumbers = Array.from(
  { length: 6 },
  (_, slot) => teamNumber - 3 - slot,
);
const userIds = Object.fromEntries(
  ["owner", "peer", "lead", "otherLead", "noTeam", "unverified"].map((name) => [
    name,
    `${name}-${fixtureId}`,
  ]),
);
const tokens: Record<string, string> = {};
const rateKeys = new Set<string>();
const tournamentKey = `manager-${fixtureId}`;

beforeAll(async () => {
  for (const number of [teamNumber, otherTeamNumber, unverifiedTeamNumber]) {
    await db.team.create({ data: { number, name: "Synthetic manager team" } });
    await db.registeredTeam.create({
      data: {
        number,
        code: `${fixtureId}-${number}`,
        email: `${fixtureId}-${number}@example.invalid`,
        emailVerified: number !== unverifiedTeamNumber,
      },
    });
  }
  await db.team.createMany({
    data: robotTeamNumbers.map((number) => ({
      number,
      name: "Synthetic match result robot",
    })),
  });

  await db.tournament.create({
    data: { key: tournamentKey, name: "Synthetic picklist tournament" },
  });
  for (const [name, id] of Object.entries(userIds)) {
    await db.user.create({
      data: {
        id,
        email: `${id}@example.invalid`,
        username: name,
        teamNumber:
          name === "noTeam"
            ? null
            : name === "otherLead"
              ? otherTeamNumber
              : name === "unverified"
                ? unverifiedTeamNumber
                : teamNumber,
        role:
          name === "lead" || name === "otherLead" ? "SCOUTING_LEAD" : "ANALYST",
      },
    });
    tokens[name] = await authFixture.signToken!(id);
  }
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: Object.values(userIds) } } });
  await db.team.deleteMany({
    where: {
      number: { in: [teamNumber, otherTeamNumber, unverifiedTeamNumber] },
    },
  });
  await db.tournament.deleteMany({ where: { key: tournamentKey } });
  await db.team.deleteMany({
    where: { number: { in: robotTeamNumbers } },
  });

  await kv.del([
    ...rateKeys,
    ...[teamNumber, otherTeamNumber, unverifiedTeamNumber].map(
      (number) => `auth:team:${number}`,
    ),
  ]);
  await closeRedis();
  await db.$disconnect();
});

const apiRoot = "/v1/manager/apikey";
const createKey = async (owner = "owner") => {
  const response = await request(app)
    .post(apiRoot)
    .query({ name: `key-${randomUUID()}` })
    .auth(tokens[owner], { type: "bearer" });
  expect(response.status).toBe(200);
  const token = response.body.apiKey as string;
  const keyHash = createHash("sha256").update(token).digest("hex");
  const row = await db.apiKey.findUniqueOrThrow({ where: { keyHash } });
  rateKeys.add(`auth:apikey:${keyHash}:rate`);
  return { token, row };
};

describe.sequential("API key management with real persistence and JWTs", () => {
  it("returns a new secret once and stores only its hash under the current user", async () => {
    const first = await createKey();
    const second = await createKey();
    expect(first.token).toMatch(/^lvt-[a-f0-9]{64}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.row.userId).toBe(userIds.owner);
    expect(first.row.keyHash).not.toBe(first.token);
    const listed = await request(app)
      .get(apiRoot)
      .auth(tokens.owner, { type: "bearer" });
    expect(listed.status).toBe(200);
    expect(listed.body.apiKeys).toContainEqual(
      expect.objectContaining({
        uuid: first.row.uuid,
        user: { username: "owner" },
      }),
    );
    expect(JSON.stringify(listed.body)).not.toContain(first.token);
    expect(JSON.stringify(listed.body)).not.toContain(first.row.keyHash);
  });

  it("limits analysts to their keys and lets leads see their team's keys", async () => {
    const own = await createKey();
    const peer = await createKey("peer");
    const foreign = await createKey("otherLead");
    for (const [viewer, visible, hidden] of [
      ["owner", [own.row.uuid], [peer.row.uuid, foreign.row.uuid]],
      ["lead", [own.row.uuid, peer.row.uuid], [foreign.row.uuid]],
    ] as const) {
      const response = await request(app)
        .get(apiRoot)
        .auth(tokens[viewer], { type: "bearer" });
      expect(response.status).toBe(200);
      const ids = response.body.apiKeys.map(
        (key: { uuid: string }) => key.uuid,
      );
      for (const id of visible) expect(ids).toContain(id);
      for (const id of hidden) expect(ids).not.toContain(id);
    }
  });

  it.each(["post", "patch", "delete"] as const)(
    "rejects API key authentication for %s mutations",
    async (method) => {
      const { token, row } = await createKey();
      const response = await request(app)
        [method](apiRoot)
        .query({ name: "new", uuid: row.uuid, newName: "changed" })
        .auth(token, { type: "bearer" });
      expect(response.status).toBe(403);
      expect(
        (await db.apiKey.findUniqueOrThrow({ where: { uuid: row.uuid } })).name,
      ).toBe(row.name);
    },
  );

  it.each(["post", "patch", "delete"] as const)(
    "rejects missing parameters for %s without a server error",
    async (method) => {
      expect(
        (
          await request(app)
            [method](apiRoot)
            .auth(tokens.owner, { type: "bearer" })
        ).status,
      ).toBe(400);
    },
  );

  it.each(["patch", "delete"] as const)(
    "returns 404 for %s of an unknown key",
    async (method) => {
      expect(
        (
          await request(app)
            [method](apiRoot)
            .query({ uuid: randomUUID(), newName: "new" })
            .auth(tokens.owner, { type: "bearer" })
        ).status,
      ).toBe(404);
    },
  );

  it.each(["patch", "delete"] as const)(
    "denies peer analysts and other-team leads permission to %s a key",
    async (method) => {
      const { row } = await createKey();
      for (const viewer of ["peer", "otherLead"]) {
        expect(
          (
            await request(app)
              [method](apiRoot)
              .query({ uuid: row.uuid, newName: "changed" })
              .auth(tokens[viewer], { type: "bearer" })
          ).status,
        ).toBe(403);
      }
      expect(
        (await db.apiKey.findUniqueOrThrow({ where: { uuid: row.uuid } })).name,
      ).toBe(row.name);
    },
  );

  it.each(["owner", "lead"])(
    "allows %s to rename and revoke an owner's key",
    async (viewer) => {
      const { row, token } = await createKey();
      const renamed = await request(app)
        .patch(apiRoot)
        .query({ uuid: row.uuid, newName: "renamed" })
        .auth(tokens[viewer], { type: "bearer" });
      expect(renamed.status).toBe(200);
      expect(
        (await db.apiKey.findUniqueOrThrow({ where: { uuid: row.uuid } })).name,
      ).toBe("renamed");
      expect(
        (
          await request(app)
            .delete(apiRoot)
            .query({ uuid: row.uuid })
            .auth(tokens[viewer], { type: "bearer" })
        ).status,
      ).toBe(200);
      expect(
        await db.apiKey.findUnique({ where: { uuid: row.uuid } }),
      ).toBeNull();
      expect(
        (await request(app).get(apiRoot).auth(token, { type: "bearer" }))
          .status,
      ).toBe(401);
    },
  );
});

for (const kind of ["shared", "mutable"] as const) {
  const root = `/v1/manager/${kind === "shared" ? "picklists" : "mutablepicklists"}`;
  const payload =
    kind === "shared"
      ? {
          name: "Synthetic shared",
          totalPoints: 2.5,
          autoPoints: 1,
          driverAbility: 0,
        }
      : { name: "Synthetic mutable", teams: [254, 8033, 1678], tournamentKey };
  const createPicklist = async (owner = "owner") => {
    const name = `list-${randomUUID()}`;
    expect(
      (
        await request(app)
          .post(root)
          .send({ ...payload, name, authorId: userIds.otherLead })
          .auth(tokens[owner], { type: "bearer" })
      ).status,
    ).toBe(200);
    return kind === "shared"
      ? db.sharedPicklist.findFirstOrThrow({ where: { name } })
      : db.mutablePicklist.findFirstOrThrow({ where: { name } });
  };
  const stored = (uuid: string) =>
    kind === "shared"
      ? db.sharedPicklist.findUnique({ where: { uuid } })
      : db.mutablePicklist.findUnique({ where: { uuid } });

  describe.sequential(`${kind} picklist lifecycle and tenant isolation`, () => {
    it("persists the authenticated author and round-trips the submitted values", async () => {
      const row = await createPicklist();
      expect(row.authorId).toBe(userIds.owner);
      const response = await request(app)
        .get(`${root}/${row.uuid}`)
        .auth(tokens.peer, { type: "bearer" });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ...payload,
        name: row.name,
        uuid: row.uuid,
        authorId: userIds.owner,
      });
      if (kind === "shared") expect(response.body.teleopPoints).toBe(0);
    });

    it("lists only picklists authored by the viewer's team", async () => {
      const own = await createPicklist();
      const foreign = await createPicklist("otherLead");
      const response = await request(app)
        .get(root)
        .auth(tokens.owner, { type: "bearer" });
      expect(response.status).toBe(200);
      const ids = response.body.map((row: { uuid: string }) => row.uuid);
      expect(ids).toContain(own.uuid);
      expect(ids).not.toContain(foreign.uuid);
    });

    it.each(["get", "put"] as const)(
      "returns 404 for %s of a missing or another team's picklist",
      async (method) => {
        const foreign = await createPicklist("otherLead");
        for (const uuid of [foreign.uuid, randomUUID()]) {
          expect(
            (
              await request(app)
                [method](`${root}/${uuid}`)
                .send(payload)
                .auth(tokens.owner, { type: "bearer" })
            ).status,
          ).toBe(404);
        }
        expect((await stored(foreign.uuid))?.name).toBe(foreign.name);
      },
    );

    it("allows a teammate to update without changing another team's data", async () => {
      const row = await createPicklist();
      expect(
        (
          await request(app)
            .put(`${root}/${row.uuid}`)
            .send({ ...payload, name: "updated" })
            .auth(tokens.peer, { type: "bearer" })
        ).status,
      ).toBe(200);
      expect(await stored(row.uuid)).toMatchObject({
        name: "updated",
        authorId: userIds.peer,
      });
    });

    it("rejects malformed create and update bodies without changing a saved picklist", async () => {
      const row = await createPicklist();
      const invalid =
        kind === "shared"
          ? { name: 123, totalPoints: "bad" }
          : { name: "bad", teams: [-1] };
      expect(
        (
          await request(app)
            .post(root)
            .send(invalid)
            .auth(tokens.owner, { type: "bearer" })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .put(`${root}/${row.uuid}`)
            .send(invalid)
            .auth(tokens.owner, { type: "bearer" })
        ).status,
      ).toBe(400);
      expect((await stored(row.uuid))?.name).toBe(row.name);
    });

    if (kind === "mutable") {
      it("rejects fractional team numbers before writing to an integer database field", async () => {
        const row = await createPicklist();
        const invalid = { ...payload, teams: [8033.5] };
        expect(
          (
            await request(app)
              .post(root)
              .send(invalid)
              .auth(tokens.owner, { type: "bearer" })
          ).status,
        ).toBe(400);
        expect(
          (
            await request(app)
              .put(`${root}/${row.uuid}`)
              .send(invalid)
              .auth(tokens.owner, { type: "bearer" })
          ).status,
        ).toBe(400);
        expect((await stored(row.uuid))?.name).toBe(row.name);
      });
    }

    it("denies another team's deletion and lets a teammate delete", async () => {
      const row = await createPicklist();
      expect(
        (
          await request(app)
            .delete(`${root}/${row.uuid}`)
            .auth(tokens.otherLead, { type: "bearer" })
        ).status,
      ).toBe(403);
      expect(await stored(row.uuid)).not.toBeNull();
      expect(
        (
          await request(app)
            .delete(`${root}/${row.uuid}`)
            .auth(tokens.peer, { type: "bearer" })
        ).status,
      ).toBe(200);
      expect(await stored(row.uuid)).toBeNull();
      expect(
        (
          await request(app)
            .delete(`${root}/${row.uuid}`)
            .auth(tokens.peer, { type: "bearer" })
        ).status,
      ).toBe(404);
    });

    it.each(["post", "put", "delete"] as const)(
      "blocks API key authentication for %s writes",
      async (method) => {
        const row = await createPicklist();
        const { token } = await createKey();
        const path = method === "post" ? root : `${root}/${row.uuid}`;
        expect(
          (
            await request(app)
              [method](path)
              .send({ ...payload, name: "forbidden" })
              .auth(token, { type: "bearer" })
          ).status,
        ).toBe(403);
        expect((await stored(row.uuid))?.name).toBe(row.name);
      },
    );
  });
}

for (const root of [
  apiRoot,
  "/v1/manager/picklists",
  "/v1/manager/mutablepicklists",
]) {
  describe(`${root} authentication and verification gates`, () => {
    it.each(["get", "post"] as const)(
      "requires a token before %s",
      async (method) => {
        expect(
          (
            await request(app)
              [method](root)
              .send({ name: "unauthorized", teams: [] })
          ).status,
        ).toBe(401);
      },
    );
    it.each([
      ["noTeam", 401],
      ["unverified", 403],
    ] as const)("denies %s users", async (viewer, status) => {
      expect(
        (
          await request(app)
            .post(root)
            .query({ name: "forbidden" })
            .send({ name: "forbidden", teams: [] })
            .auth(tokens[viewer], { type: "bearer" })
        ).status,
      ).toBe(status);
    });
  });
}

describe("scouter archival tenant isolation", () => {
  it.each(["archive", "unarchive"])(
    "limits %s to the authenticated lead's team",
    async (action) => {
      const scouter = await db.scouter.create({
        data: {
          sourceTeamNumber: teamNumber,
          archived: action === "unarchive",
        },
      });
      const path = `/v1/manager/${action}/uuid/${scouter.uuid}`;
      const unauthorized = await request(app)
        .post(path)
        .auth(tokens.otherLead, { type: "bearer" });
      expect(unauthorized.status).toBe(404);
      expect(
        (await db.scouter.findUniqueOrThrow({ where: { uuid: scouter.uuid } }))
          .archived,
      ).toBe(action === "unarchive");
      const authorized = await request(app)
        .post(path)
        .auth(tokens.lead, { type: "bearer" });
      expect(authorized.status).toBe(200);
      expect(
        (await db.scouter.findUniqueOrThrow({ where: { uuid: scouter.uuid } }))
          .archived,
      ).toBe(action === "archive");
      expect(
        (
          await request(app)
            .post(`/v1/manager/${action}/uuid/${randomUUID()}`)
            .auth(tokens.lead, { type: "bearer" })
        ).status,
      ).toBe(404);
    },
  );
});

it("prevents a lead from transferring another team's shift by editing its UUID", async () => {
  const shift = await db.scouterScheduleShift.create({
    data: {
      sourceTeamNumber: teamNumber,
      tournamentKey,
      startMatchOrdinalNumber: 1,
      endMatchOrdinalNumber: 10,
    },
  });
  const body = {
    startMatchOrdinalNumber: 2,
    endMatchOrdinalNumber: 9,
    team1: [],
    team2: [],
    team3: [],
    team4: [],
    team5: [],
    team6: [],
  };
  const path = `/v1/manager/scoutershifts/${shift.uuid}`;
  expect(
    (
      await request(app)
        .post(path)
        .send(body)
        .auth(tokens.otherLead, { type: "bearer" })
    ).status,
  ).toBe(403);
  expect(
    await db.scouterScheduleShift.findUniqueOrThrow({
      where: { uuid: shift.uuid },
    }),
  ).toMatchObject({
    sourceTeamNumber: teamNumber,
    startMatchOrdinalNumber: 1,
    endMatchOrdinalNumber: 10,
  });
  expect(
    (
      await request(app)
        .post(path)
        .send(body)
        .auth(tokens.lead, { type: "bearer" })
    ).status,
  ).toBe(200);
  expect(
    await db.scouterScheduleShift.findUniqueOrThrow({
      where: { uuid: shift.uuid },
    }),
  ).toMatchObject({
    sourceTeamNumber: teamNumber,
    startMatchOrdinalNumber: 2,
    endMatchOrdinalNumber: 9,
  });
});

it("filters match-result reports by the authenticated viewer's source rules", async () => {
  const matchKey = `results-${fixtureId}`;
  await db.user.update({
    where: { id: userIds.lead },
    data: { teamSourceRule: { mode: "INCLUDE", items: [teamNumber] } },
  });
  for (let slot = 0; slot < 6; slot++)
    await db.teamMatchData.create({
      data: {
        key: `${matchKey}_${slot}`,
        teamNumber: robotTeamNumbers[slot],
        tournamentKey,
        matchNumber: 1,
        matchType: "QUALIFICATION",
      },
    });
  const reports = [];
  for (const sourceTeamNumber of [teamNumber, otherTeamNumber]) {
    const scouter = await db.scouter.create({ data: { sourceTeamNumber } });
    reports.push(
      await db.scoutReport.create({
        data: {
          scouterUuid: scouter.uuid,
          teamMatchKey: `${matchKey}_0`,
          startTime: new Date(),
          notes: sourceTeamNumber === teamNumber ? "Visible" : "Hidden",
          robotRoles: [],
          driverAbility: 3,
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
      }),
    );
  }
  const response = await request(app)
    .get("/v1/manager/match-results-page")
    .query({ matchKey })
    .auth(tokens.lead, { type: "bearer" });
  expect(response.status).toBe(200);
  expect(
    response.body.red.teams[0].reports.map(
      (report: { uuid: string }) => report.uuid,
    ),
  ).toEqual([reports[0].uuid]);
  expect(JSON.stringify(response.body)).not.toContain(reports[1].uuid);
});
