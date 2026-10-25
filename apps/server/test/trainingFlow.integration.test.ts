import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import request from "supertest";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const call = (path: string, body: object, scout = scouts[0], teamCode = code) =>
  request(app)
    .post(`/collection${path}`)
    .set("X-Team-Code", teamCode)
    .set("X-Scouter-UUID", scout)
    .set("X-Device-Id", `test-${scout}`)
    .send(body);
const host = (uuid: string, token: string, action: string) =>
  request(app)
    .post(`/collection/training/sessions/${uuid}/control`)
    .set("Authorization", `Bearer ${token}`)
    .send({ action });
async function create() {
  const result = await request(app)
    .post("/collection/training/sessions")
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
  expect(
    (
      await request(app)
        .post(`/collection/training/sessions/${session.uuid}/ready`)
        .set("Authorization", `Bearer ${attempt.attemptToken}`)
        .send({ attemptUuid: attempt.attemptUuid })
    ).status,
  ).toBe(200);
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
    expect((await host(session.uuid, session.browserToken, "arm")).status).toBe(
      409,
    );
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
    const startTime = Date.now() - 170_000;
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
  it("authenticates WebSocket snapshots without exposing tokens in URLs", async () => {
    const session = await create();
    const attempt = await join(session);
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test server");
    const ws = new WebSocket(
      `ws://127.0.0.1:${address.port}/collection/training/socket`,
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
  });
});
