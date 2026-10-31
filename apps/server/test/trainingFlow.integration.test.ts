import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import request from "supertest";
import { WebSocket } from "ws";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fixture from "./fixtures/training/118-johnson-qual-19.report.json";
import { reportSchema } from "../src/handler/collection/reportSchema.js";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
)
  throw new Error("Use the disposable local lovat_test database.");
const { db } = await import("@lovat/db");
const { default: routes } =
  await import("../src/routes/collection/collection.routes.js");
const { attachTrainingSockets } =
  await import("../src/handler/training/trainingSockets.js");
const { reportEvents } = await import("../src/handler/training/gradeReport.js");
const app = express();
// Each fixture represents a separate browser; retain the real rate limiter.
app.set("trust proxy", "loopback");
app.use(express.json());
app.use("/collection", routes);
const server = app.listen(0, "127.0.0.1");
attachTrainingSockets(server);
const code = randomUUID(),
  otherCode = randomUUID();
const sourceTeam = -Math.floor(Math.random() * 1e9) - 1,
  robot = 1_000_000_000 + Math.floor(Math.random() * 1e8);
const scouts = [randomUUID(), randomUUID()],
  foreignScout = randomUUID();
const tournamentKey = `2026training-${code}`,
  matchKey = `${tournamentKey}_qm19`;
const keyUuid = randomUUID(),
  videoUuid = randomUUID();
const sessions: string[] = [];
afterEach(() => vi.unstubAllEnvs());
const call = (path: string, body: object, scout = scouts[0], teamCode = code) =>
  request(app)
    .post(`/collection${path}`)
    .set("X-Team-Code", teamCode)
    .set("X-Scouter-UUID", scout)
    .set("X-Device-Id", `test-${scout}`)
    .send(body);
const host = (
  uuid: string,
  token: string,
  action: string,
  playbackSeconds?: number,
) =>
  request(app)
    .post(`/collection/training/sessions/${uuid}/control`)
    .set("Authorization", `Bearer ${token}`)
    .send({ action, playbackSeconds });
async function create() {
  const result = await request(app)
    .post("/collection/training/sessions")
    .set("X-Forwarded-For", `192.0.2.${sessions.length + 1}`)
    .send({ videoUuid });
  expect(result.status).toBe(201);
  sessions.push(result.body.uuid);
  return result.body as {
    uuid: string;
    browserToken: string;
    pairingToken: string;
  };
}
async function join(
  session: Awaited<ReturnType<typeof create>>,
  scout = scouts[0],
) {
  const result = await call(
    `/train/${session.uuid}`,
    { pairingToken: session.pairingToken, deviceName: "Test tablet" },
    scout,
  );
  expect(result.status).toBe(200);
  return result.body as { attemptUuid: string; attemptToken: string };
}
async function ready(
  session: Awaited<ReturnType<typeof create>>,
  attempt: Awaited<ReturnType<typeof join>>,
  stage: "LOBBY" | "ARMED",
) {
  return request(app)
    .post(`/collection/training/sessions/${session.uuid}/ready`)
    .set("Authorization", `Bearer ${attempt.attemptToken}`)
    .send({ attemptUuid: attempt.attemptUuid, stage });
}
async function load(
  session: Awaited<ReturnType<typeof create>>,
  attempt: Awaited<ReturnType<typeof join>>,
  uuid: string,
  scout = scouts[0],
) {
  const result = await call(
    "/load",
    {
      uuid,
      teamNumber: robot,
      matchIdentity: {
        tournamentKey,
        matchType: "QUALIFICATION",
        matchNumber: 19,
      },
      trainingAttemptUuid: attempt.attemptUuid,
    },
    scout,
  );
  expect(result.status).toBe(201);
  expect((await ready(session, attempt, "LOBBY")).status).toBe(200);
}
beforeAll(async () => {
  if (!server.listening) {
    await once(server, "listening");
  }
  for (const number of [sourceTeam, sourceTeam - 1, robot])
    await db.team.create({ data: { number, name: "Training test" } });
  for (const [number, teamCode] of [
    [sourceTeam, code],
    [sourceTeam - 1, otherCode],
  ] as const)
    await db.registeredTeam.create({
      data: { number, code: teamCode, email: `${teamCode}@example.invalid` },
    });
  for (const uuid of scouts)
    await db.scouter.create({
      data: { uuid, name: "Training scout", sourceTeamNumber: sourceTeam },
    });
  await db.scouter.create({
    data: { uuid: foreignScout, sourceTeamNumber: sourceTeam - 1 },
  });
  await db.tournament.create({
    data: { key: tournamentKey, name: "Training test" },
  });
  await db.match.create({
    data: {
      key: matchKey,
      tournamentKey,
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 19,
    },
  });
  await db.teamMatchData.create({
    data: {
      key: matchKey,
      matchKey,
      tournamentKey,
      matchType: "QUALIFICATION",
      matchNumber: 19,
      teamNumber: robot,
    },
  });
  const {
    events,
    mobility,
    uuid: _uuid,
    teamNumber: _team,
    matchNumber: _match,
    matchType: _type,
    tournamentKey: _key,
    startTime,
    _scouter,
    ...rest
  } = {
    ...reportSchema.omit({ appVersion: true }).parse(fixture),
    _scouter: fixture.scouterUuid,
  };
  void _uuid;
  void _team;
  void _match;
  void _type;
  void _key;
  void _scouter;
  await db.scoutReport.create({
    data: {
      ...rest,
      uuid: keyUuid,
      scouterUuid: scouts[0],
      startTime: new Date(startTime),
      teamMatchKey: matchKey,
      fieldTraversal: mobility as "BOTH",
      training: true,
      events: {
        create: reportEvents(events as number[][]).map((event) => ({
          ...event,
          points: event.action === "STOP_SCORING" ? event.quantity : 0,
        })),
      },
    },
  });
  await db.trainingVideo.create({
    data: {
      uuid: videoUuid,
      matchKey,
      videoLink: "https://www.youtube.com/watch?v=l2kbcWkUx4E",
      answerKeyReports: { connect: { uuid: keyUuid } },
    },
  });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.trainingSession.deleteMany({ where: { uuid: { in: sessions } } });
  await db.scoutReport.deleteMany({ where: { scouterUuid: { in: scouts } } });
  await db.trainingVideo.deleteMany({ where: { uuid: videoUuid } });
  await db.tournament.deleteMany({ where: { key: tournamentKey } });
  await db.registeredTeam.deleteMany({
    where: { number: { in: [sourceTeam, sourceTeam - 1] } },
  });
  await db.team.deleteMany({
    where: { number: { in: [sourceTeam, sourceTeam - 1, robot] } },
  });
  await db.$disconnect();
});
describe("paired training flow", () => {
  it("explains a malformed scout ID without consuming the pairing code", async () => {
    const session = await create();
    const rejected = await call(
      `/train/${session.uuid}`,
      { pairingToken: session.pairingToken, deviceName: "Test tablet" },
      "4f609778-1f19-44gb-8d81-29a893f84c73",
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body.invalidFields).toEqual(["scouterUuid"]);
    expect(rejected.body.displayError).toContain("Choose your scout again");
    expect(JSON.stringify(rejected.body)).not.toContain(session.pairingToken);

    await join(session);
    const snapshot = await request(app)
      .get(`/collection/training/sessions/${session.uuid}`)
      .set("Authorization", `Bearer ${session.browserToken}`);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.participants).toHaveLength(1);
  });

  it("keeps answer keys private and rejects missing browser credentials", async () => {
    const session = await create();
    const catalog = await request(app).get("/collection/training/videos");
    const video = catalog.body.find(
      (v: { uuid: string }) => v.uuid === videoUuid,
    );
    expect(video.teamNumber).toBe(robot);
    expect(video).not.toHaveProperty("answerKeyReports");
    expect(
      (await request(app).get(`/collection/training/sessions/${session.uuid}`))
        .status,
    ).toBe(404);
  });
  it("requires a valid QR and locks participants to the first source team", async () => {
    const session = await create();
    await join(session);
    expect(
      (
        await call(`/train/${session.uuid}`, {
          pairingToken: "bad".repeat(20),
          deviceName: "Test",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          `/train/${session.uuid}`,
          { pairingToken: session.pairingToken, deviceName: "Other" },
          foreignScout,
          otherCode,
        )
      ).status,
    ).toBe(403);
    expect(
      (await host(session.uuid, session.browserToken, "play")).status,
    ).toBe(409);
  });
  it("loads the same robot for two scouts and grades a delayed upload exactly once", async () => {
    const session = await create();
    const a = await join(session),
      b = await join(session, scouts[1]);
    const uuid = randomUUID(),
      second = randomUUID();
    await load(session, a, uuid);
    await load(session, b, second, scouts[1]);
    expect((await host(session.uuid, session.browserToken, "arm")).status).toBe(
      200,
    );
    expect((await ready(session, a, "ARMED")).status).toBe(200);
    expect((await ready(session, b, "ARMED")).status).toBe(200);
    expect(
      (await host(session.uuid, session.browserToken, "play")).status,
    ).toBe(200);
    expect(
      (
        await call(`/train/${session.uuid}`, {
          pairingToken: session.pairingToken,
          deviceName: "Late",
        })
      ).status,
    ).toBe(409);
    const startTime = Date.now() - 190_000;
    await db.trainingSession.update({
      where: { uuid: session.uuid },
      data: { startedAt: new Date(startTime) },
    });
    expect((await host(session.uuid, session.browserToken, "end")).status).toBe(
      200,
    );
    expect((await call("/start", { uuid, startTime })).status).toBe(200);
    expect(
      (await call("/end", { uuid, endTime: startTime + 163_000 })).status,
    ).toBe(200);
    const body = {
      ...fixture,
      uuid,
      scouterUuid: scouts[0],
      teamNumber: robot,
      tournamentKey,
      startTime,
    };
    expect((await call(`/training/${session.uuid}/submit`, body)).status).toBe(
      200,
    );
    // Await the retry request's server-side grading transaction as well.
    await call(`/training/${session.uuid}/submit`, body);
    const graded = await request(app)
      .post(`/collection/training/sessions/${session.uuid}/grade`)
      .set("Authorization", `Bearer ${session.browserToken}`)
      .send({});
    expect(graded.status).toBe(200);
    expect(graded.body.participants[0].score.overallScore).toBe(100);
    expect(graded.body.participants[1].reportUuid).toBe(null);
    expect(await db.trainingScore.count({ where: { reportUuid: uuid } })).toBe(
      1,
    );
    expect(
      (await db.scoutReport.findUniqueOrThrow({ where: { uuid } })).training,
    ).toBe(true);
  });
  it.each([
    undefined,
    "https://website-lovat-pr-93.up.railway.app",
    "https://api-lovat-pr-93.up.railway.app",
  ])(
    "authenticates WebSocket snapshots from %s without tokens in URLs",
    async (origin) => {
      vi.stubEnv(
        "RAILWAY_SERVICE_WEBSITE_URL",
        "website-lovat-pr-93.up.railway.app",
      );
      vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "api-lovat-pr-93.up.railway.app");
      const session = await create();
      const attempt = await join(session);
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No test server");
      const ws = new WebSocket(
        `ws://127.0.0.1:${address.port}/collection/training/socket`,
        { origin },
      );
      await once(ws, "open");
      const message = once(ws, "message");
      ws.send(
        JSON.stringify({
          sessionUuid: session.uuid,
          attemptUuid: attempt.attemptUuid,
          token: attempt.attemptToken,
        }),
      );
      const [raw] = await message;
      const snapshot = JSON.parse(raw.toString());
      expect(snapshot.uuid).toBe(session.uuid);
      expect(snapshot.participants).toHaveLength(1);
      expect(snapshot).not.toHaveProperty("browserTokenHash");
      ws.close();
      await once(ws, "close");
    },
  );
});

describe("training preview, timing, and reconnect regression", () => {
  const deviceSnapshot = (
    session: Awaited<ReturnType<typeof create>>,
    attempt: Awaited<ReturnType<typeof join>>,
    token = attempt.attemptToken,
  ) =>
    request(app)
      .get(
        `/collection/training/sessions/${session.uuid}?attempt=${attempt.attemptUuid}`,
      )
      .set("Authorization", `Bearer ${token}`);
  it("requires lobby readiness, then fresh pose confirmation before Play", async () => {
    const s = await create(),
      a = await join(s);
    expect((await host(s.uuid, s.browserToken, "arm")).status).toBe(409);
    await load(s, a, randomUUID());
    expect((await host(s.uuid, s.browserToken, "arm")).status).toBe(200);
    expect((await host(s.uuid, s.browserToken, "arm")).status).toBe(200);
    expect((await deviceSnapshot(s, a)).body.participants[0].ready).toBe(false);
    expect((await ready(s, a, "LOBBY")).status).toBe(409);
    expect((await host(s.uuid, s.browserToken, "play")).status).toBe(409);
    expect((await ready(s, a, "ARMED")).status).toBe(200);
    // Retrying the host's arm request must not clear pose confirmation again.
    expect((await host(s.uuid, s.browserToken, "arm")).status).toBe(200);
    await db.trainingAttempt.update({
      where: { uuid: a.attemptUuid },
      data: { lastSeenAt: new Date(Date.now() - 30_000) },
    });
    expect((await host(s.uuid, s.browserToken, "play")).status).toBe(409);
    const refreshed = await deviceSnapshot(s, a);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.participants[0].connected).toBe(true);
    expect(refreshed.body.video.postMatchSeconds).toBe(15);
    expect(refreshed.body.video.durationSeconds).toBe(163);
    const played = await host(s.uuid, s.browserToken, "play");
    expect(played.status).toBe(200);
    expect((await host(s.uuid, s.browserToken, "play")).body.startedAt).toBe(
      played.body.startedAt,
    );
  });
  it("accepts readiness requests from older Collection builds without a stage field", async () => {
    const session = await create();
    const attempt = await join(session);
    await load(session, attempt, randomUUID());
    expect((await host(session.uuid, session.browserToken, "arm")).status).toBe(
      200,
    );
    const legacyReady = await request(app)
      .post(`/collection/training/sessions/${session.uuid}/ready`)
      .set("Authorization", `Bearer ${attempt.attemptToken}`)
      .send({ attemptUuid: attempt.attemptUuid });
    expect(legacyReady.status).toBe(200);
    expect(
      (await host(session.uuid, session.browserToken, "play")).status,
    ).toBe(200);
  });
  it("cannot refresh another attempt's heartbeat with the host token or a foreign token", async () => {
    const s = await create(),
      a = await join(s);
    const old = new Date(Date.now() - 30_000);
    await db.trainingAttempt.update({
      where: { uuid: a.attemptUuid },
      data: { lastSeenAt: old },
    });
    expect((await deviceSnapshot(s, a, s.browserToken)).status).toBe(404);
    expect((await deviceSnapshot(s, a, "wrong")).status).toBe(404);
    expect(
      (
        await db.trainingAttempt.findUniqueOrThrow({
          where: { uuid: a.attemptUuid },
        })
      ).lastSeenAt,
    ).toEqual(old);
    await db.trainingSession.update({
      where: { uuid: s.uuid },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await deviceSnapshot(s, a)).status).toBe(410);
  });
  it("keeps scoring duration separate from the fifteen-second video tail", async () => {
    const s = await create(),
      a = await join(s);
    await load(s, a, randomUUID());
    await host(s.uuid, s.browserToken, "arm");
    expect((await ready(s, a, "ARMED")).status).toBe(200);
    await host(s.uuid, s.browserToken, "play");
    const start = Date.now() - 164_000;
    await db.trainingSession.update({
      where: { uuid: s.uuid },
      data: { startedAt: new Date(start) },
    });
    expect((await host(s.uuid, s.browserToken, "end")).status).toBe(409);
    await db.trainingSession.update({
      where: { uuid: s.uuid },
      data: { startedAt: new Date(start - 20_000) },
    });
    const ended = await host(s.uuid, s.browserToken, "end");
    expect(ended.status).toBe(200);
    expect(ended.body.endedAt).toBe(start - 20_000 + 163_000);
    expect((await host(s.uuid, s.browserToken, "end")).body.endedAt).toBe(
      ended.body.endedAt,
    );
    expect((await host(s.uuid, s.browserToken, "play")).status).toBe(409);
  });
  it.each([
    [100, "INTERRUPTED"],
    [165, "ENDED"],
  ] as const)(
    "replays an interruption observed at %s seconds as %s, without using delivery time",
    async (seconds, status) => {
      const s = await create(),
        a = await join(s);
      await load(s, a, randomUUID());
      await host(s.uuid, s.browserToken, "arm");
      expect((await ready(s, a, "ARMED")).status).toBe(200);
      await host(s.uuid, s.browserToken, "play");
      const start = Date.now() - 190_000;
      await db.trainingSession.update({
        where: { uuid: s.uuid },
        data: { startedAt: new Date(start) },
      });
      const result = await host(s.uuid, s.browserToken, "interrupt", seconds);
      expect(result.status).toBe(200);
      expect(result.body.status).toBe(status);
      const retry = await host(
        s.uuid,
        s.browserToken,
        "interrupt",
        status === "INTERRUPTED" ? 165 : 100,
      );
      expect(retry.body.status).toBe(status);
      if (status === "ENDED") expect(result.body.endedAt).toBe(start + 163_000);
    },
  );
  it.each(["LOBBY", "ARMED", "PLAYING", "ENDED", "INTERRUPTED"] as const)(
    "reauthenticates the same attempt over HTTP and WebSocket in %s",
    async (status) => {
      const s = await create(),
        a = await join(s),
        b = await join(s, scouts[1]);
      const startedAt = ["PLAYING", "ENDED"].includes(status)
        ? new Date(Date.now() - 170_000)
        : null;
      await db.trainingSession.update({
        where: { uuid: s.uuid },
        data: {
          status,
          startedAt,
          endedAt:
            status === "ENDED"
              ? new Date(startedAt!.getTime() + 163_000)
              : null,
        },
      });
      for (let reconnect = 0; reconnect < 2; reconnect++) {
        await db.trainingAttempt.update({
          where: { uuid: a.attemptUuid },
          data: { lastSeenAt: new Date(Date.now() - 30_000) },
        });
        const http = await deviceSnapshot(s, a);
        expect(http.status).toBe(200);
        expect(http.body.status).toBe(status);
        expect(http.body.participants).toHaveLength(1);
        expect(http.body.participants[0].uuid).toBe(a.attemptUuid);
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("No server");
        const ws = new WebSocket(
          `ws://127.0.0.1:${address.port}/collection/training/socket`,
        );
        await once(ws, "open");
        const message = once(ws, "message");
        ws.send(
          JSON.stringify({
            sessionUuid: s.uuid,
            attemptUuid: a.attemptUuid,
            token: a.attemptToken,
          }),
        );
        const [raw] = await message;
        const value = JSON.parse(raw.toString());
        expect(value.status).toBe(status);
        expect(value.startedAt).toBe(startedAt?.getTime() ?? null);
        expect(JSON.stringify(value)).not.toContain(b.attemptUuid);
        ws.terminate();
        await once(ws, "close");
      }
      expect(
        await db.trainingAttempt.count({ where: { sessionUuid: s.uuid } }),
      ).toBe(2);
    },
  );
});
