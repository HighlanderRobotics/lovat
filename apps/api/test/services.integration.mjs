import { createSignatureVerifier } from "../dist/signatures.js";
import { WebSocket } from "ws";
import { attachTrainingSockets } from "../dist/sockets.js";
import { createAnalysisService } from "../dist/analysis.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { createApi } from "../dist/app.js";
import { createServices } from "../dist/services/index.js";
import { createRepository } from "../dist/repository.js";
import { accessScope } from "../dist/auth.js";

const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
) {
  throw new Error(
    "Use a disposable loopback lovat_test database with LOVAT_DB_TEST=1",
  );
}
const { createDb } = await import("@lovat/db");
const db = createDb(url.href, { maxConnections: 4, statementTimeoutMs: 8000 });
test("rewritten services preserve atomic report lifecycle, idempotency and tenant boundaries", async (t) => {
  const suffix = randomUUID();
  const own = 1000000000 + Math.floor(Math.random() * 100000000);
  const other = own + 1;
  const robot = own + 2;
  const scout = randomUUID();
  const eventKey = "2026-rewrite-" + suffix;
  const matchKey = eventKey + "_qm1";
  const actorId = "rewrite|" + suffix;
  const actor = {
    id: actorId,
    teamNumber: own,
    role: "SCOUTING_LEAD",
    teamSourceRule: { mode: "INCLUDE", items: [own] },
    tournamentSourceRule: { mode: "EXCLUDE", items: [] },
    team: { emailVerified: true },
  };
  await db.season.upsert({
    where: { year: 2026 },
    create: { year: 2026 },
    update: {},
  });
  for (const number of [own, other, robot])
    await db.team.create({ data: { number, name: "Synthetic rewrite test" } });
  for (const number of [own, other])
    await db.registeredTeam.create({
      data: {
        number,
        code: suffix + number,
        email: number + "@example.invalid",
        emailVerified: true,
        teamApproved: true,
      },
    });
  await db.user.create({
    data: {
      id: actorId,
      teamNumber: own,
      email: suffix + "@example.invalid",
      role: "SCOUTING_LEAD",
      teamSourceRule: actor.teamSourceRule,
      tournamentSourceRule: actor.tournamentSourceRule,
    },
  });
  await db.scouter.create({
    data: { uuid: scout, sourceTeamNumber: own, name: "Synthetic scout" },
  });
  await db.tournament.create({
    data: {
      key: eventKey,
      name: "Synthetic rewrite test",
      seasonYear: 2026,
      date: "2026-03-01",
    },
  });
  await db.match.create({
    data: {
      key: matchKey,
      tournamentKey: eventKey,
      competitionLevel: "QUALIFICATION",
      setNumber: 1,
      matchNumber: 1,
    },
  });
  await db.teamMatchData.create({
    data: {
      key: matchKey + "_0",
      matchKey,
      tournamentKey: eventKey,
      matchType: "QUALIFICATION",
      matchNumber: 1,
      teamNumber: robot,
      alliance: "RED",
      station: 1,
    },
  });
  const repository = createRepository(db);
  const api = createApi({
    repository,
    authenticate: async () => accessScope(actor),
    ready: async () => true,
    services: {
      router: createServices({
        baseUrl: "https://api.example",
        commit: "test",
        analyze: createAnalysisService(repository),
      }),
      db,
      verifySignature: createSignatureVerifier({
        lovatKey: "test-signing-key",
      }),
      authenticate: async (authorization) => ({
        user:
          authorization === "Bearer newbie" || authorization === "Bearer join"
            ? await db.user.findUniqueOrThrow({
                where: {
                  id:
                    actorId +
                    (authorization === "Bearer newbie"
                      ? "-onboarding"
                      : "-join"),
                },
                include: { team: { select: { emailVerified: true } } },
              })
            : authorization === "Bearer other"
              ? {
                  ...actor,
                  id: actorId,
                  teamNumber: other,
                  teamSourceRule: { mode: "INCLUDE", items: [other] },
                }
              : actor,
        tokenType: "jwt",
      }),
    },
  });
  const sockets = attachTrainingSockets(api.server, db, [
    "https://allowed.example",
  ]);
  api.server.listen(0, "127.0.0.1");
  await once(api.server, "listening");
  const base = "http://127.0.0.1:" + api.server.address().port;
  async function call(method, path, body, extras = {}) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer own",
        "X-Team-Code": suffix + own,
        "X-Scouter-Uuid": scout,
        "X-Device-Id": suffix,
        ...extras,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  t.after(async () => {
    sockets.close();
    api.server.closeAllConnections();
    await new Promise((resolve) => api.server.close(resolve));
    await db.trainingVideo.deleteMany({ where: { matchKey } });
    await db.analysisRevision.deleteMany({ where: { teamNumber: robot } });
    await db.apiOutbox.deleteMany({
      where: { dedupeKey: { startsWith: "analysis:" + robot + ":" } },
    });
    await db.tournament.delete({ where: { key: eventKey } });
    const codes = await db.emailVerificationRequest.findMany({
      where: { teamNumber: { in: [own, other, robot] } },
      select: { verificationCode: true },
    });
    await db.apiOutbox.deleteMany({
      where: {
        OR: [
          {
            dedupeKey: {
              in: codes.map((row) => "verify:" + row.verificationCode),
            },
          },
          {
            payload: { path: ["to"], equals: suffix + "-team@example.invalid" },
          },
        ],
      },
    });
    await db.emailVerificationRequest.deleteMany({
      where: { teamNumber: { in: [own, other, robot] } },
    });
    await db.registeredTeam.deleteMany({
      where: { number: { in: [own, other, robot] } },
    });
    await db.team.deleteMany({
      where: { number: { in: [own, other, robot] } },
    });
    await db.$disconnect();
  });
  const uuid = randomUUID();
  const startTime = Date.now() - 180000;
  const endTime = startTime + 150000;
  const report = {
    uuid,
    scouterUuid: scout,
    tournamentKey: eventKey,
    matchType: "QUALIFICATION",
    matchNumber: 1,
    teamNumber: robot,
    startTime,
    notes: "Synthetic test",
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
    events: [
      [0, 2, 8],
      [10, 0, 2],
      [20, 1, 2, 5],
    ],
  };
  assert.equal(
    (await call("POST", "/collection/load/" + matchKey + "/" + robot, { uuid }))
      .status,
    201,
  );
  assert.equal(
    (await call("POST", "/collection/start", { uuid, startTime })).status,
    200,
  );
  assert.equal(
    (await call("POST", "/collection/start", { uuid, startTime })).status,
    200,
  );
  assert.equal(
    (
      await call("POST", "/collection/start", {
        uuid,
        startTime: startTime + 1,
      })
    ).status,
    409,
  );
  assert.equal((await call("POST", "/collection/submit", report)).status, 409);
  assert.equal(
    (await call("POST", "/collection/end", { uuid, endTime })).status,
    200,
  );
  assert.equal((await call("POST", "/collection/submit", report)).status, 200);
  assert.equal((await call("POST", "/collection/submit", report)).status, 200);
  assert.equal(
    (
      await call("POST", "/collection/submit", {
        ...report,
        notes: "different",
      })
    ).status,
    409,
  );
  assert.equal(await db.scoutReport.count({ where: { uuid } }), 1);
  assert.equal(await db.event.count({ where: { scoutReportUuid: uuid } }), 3);
  assert.equal(
    (
      await call("GET", "/v1/manager/scoutreports/" + uuid, undefined, {
        Authorization: "Bearer other",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("DELETE", "/v1/manager/scoutreports/" + uuid, undefined, {
        Authorization: "Bearer other",
      })
    ).status,
    404,
  );
  const analysis = await call("POST", "/v3/analysis", {
    teams: [robot],
    metrics: ["totalPoints"],
  });
  assert.equal(analysis.status, 200);
  assert.equal(
    (await analysis.json()).teams[String(robot)].metrics.totalPoints.value,
    5,
  );
  const picklist = await call("POST", "/v1/manager/mutablepicklists", {
    name: "Synthetic",
    teams: [robot],
  });
  assert.equal(picklist.status, 200);
  const lists = await (
    await call("GET", "/v1/manager/mutablepicklists")
  ).json();
  assert.equal(lists.length, 1);
  assert.equal(
    (
      await call(
        "PUT",
        "/v1/manager/mutablepicklists/" + lists[0].uuid,
        { name: "stolen", teams: [] },
        { Authorization: "Bearer other" },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call("POST", "/collection/scouter", {
        name: "foreign",
        teamNumber: other,
      })
    ).status,
    403,
  );

  assert.equal(
    await db.analysisRevision.count({ where: { teamNumber: robot } }),
    1,
  );
  const revision = await db.analysisRevision.findUniqueOrThrow({
    where: { teamNumber: robot },
  });
  assert.equal(revision.revision, 1n);
  assert.equal(
    await db.apiOutbox.count({
      where: { dedupeKey: "analysis:" + robot + ":1" },
    }),
    1,
  );
  const minimal = await (
    await call("GET", "/v1/analysis/scoutreports/match/" + matchKey + "_0")
  ).json();
  assert.equal(minimal[0].scouter.name, "Synthetic scout");
  assert.equal(minimal[0].canModify, true);
  assert.equal(typeof minimal[0].startTime, "string");
  assert.equal(
    (
      await (
        await call("GET", "/v1/manager/scouterreports?scouterUuid=" + scout)
      ).json()
    )[0].teamMatchData.tournament.name,
    "Synthetic rewrite test",
  );
  const metric = await (
    await call("GET", "/v1/analysis/category/team/" + robot)
  ).json();
  assert.equal(metric.totalPoints, 5);
  const badSignature = await call(
    "POST",
    "/v1/manager/onboarding/verifyemail",
    { code: "invalid" },
  );
  assert.equal(badSignature.status, 403);
  const keyReply = await call("POST", "/v1/manager/apikey?name=Synthetic");
  const apiKey = (await keyReply.json()).apiKey;
  assert.ok(apiKey.startsWith("lvt-"));
  const storedKeys = await (await call("GET", "/v1/manager/apikey")).json();
  assert.equal(storedKeys[0].keyHash, undefined);
  const keyRow = await db.apiKey.findFirstOrThrow({
    where: { userId: actorId },
  });
  assert.notEqual(keyRow.keyHash, apiKey);
  assert.equal(
    (await call("DELETE", "/v1/manager/apikey?uuid=" + keyRow.uuid)).status,
    200,
  );
  assert.equal((await call("POST", "/v1/manager/noteam", {})).status, 409);
  const answerUuid = randomUUID(),
    videoUuid = randomUUID();
  const original = await db.scoutReport.findUniqueOrThrow({ where: { uuid } });
  await db.scoutReport.create({
    data: {
      ...original,
      uuid: answerUuid,
      training: true,
      events: {
        create: [
          {
            time: 0,
            action: "START_MATCH",
            position: "NONE",
            points: 0,
            quantity: 0,
          },
        ],
      },
    },
  });
  await db.trainingVideo.create({
    data: {
      uuid: videoUuid,
      matchKey,
      videoLink: "https://example.invalid/video",
      durationSeconds: 1,
      answerKeyReports: { connect: { uuid: answerUuid } },
    },
  });
  const created = await call("POST", "/collection/training/sessions", {
    videoUuid,
  });
  assert.equal(created.status, 201);
  const session = await created.json();
  const paired = await call("POST", "/collection/train/" + session.uuid, {
    pairingToken: session.pairingToken,
    deviceName: "Synthetic device",
  });
  assert.equal(paired.status, 200);
  const participant = await paired.json();
  assert.equal(participant.snapshot.video.postMatchSeconds, 15);
  const attemptHeaders = {
    Authorization: "Bearer " + participant.attemptToken,
  };
  const trainingUuid = randomUUID();
  assert.equal(
    (
      await call("POST", "/collection/load/" + matchKey + "/" + robot, {
        uuid: trainingUuid,
        trainingAttemptUuid: participant.attemptUuid,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/sessions/" + session.uuid + "/ready",
        { attemptUuid: participant.attemptUuid, stage: "LOBBY" },
        attemptHeaders,
      )
    ).status,
    200,
  );
  const browser = { Authorization: "Bearer " + session.browserToken };
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/sessions/" + session.uuid + "/control",
        { action: "arm" },
        browser,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/sessions/" + session.uuid + "/control",
        { action: "play" },
        browser,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/sessions/" + session.uuid + "/ready",
        { attemptUuid: participant.attemptUuid, stage: "ARMED" },
        attemptHeaders,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/sessions/" + session.uuid + "/control",
        { action: "play" },
        browser,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/sessions/" + session.uuid + "/control",
        { action: "end" },
        browser,
      )
    ).status,
    409,
  );
  await db.trainingSession.update({
    where: { uuid: session.uuid },
    data: { startedAt: new Date(Date.now() - 30000) },
  });
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/sessions/" + session.uuid + "/control",
        { action: "end" },
        browser,
      )
    ).status,
    200,
  );
  const trainingStart = Date.now() - 30000;
  assert.equal(
    (
      await call("POST", "/collection/start", {
        uuid: trainingUuid,
        startTime: trainingStart,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("POST", "/collection/end", {
        uuid: trainingUuid,
        endTime: trainingStart + 1000,
      })
    ).status,
    200,
  );
  const trainingReport = {
    ...report,
    uuid: trainingUuid,
    startTime: trainingStart,
    events: [[0, 2, 8]],
  };
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/" + session.uuid + "/submit",
        trainingReport,
      )
    ).status,
    200,
  );
  assert.equal(
    await db.trainingScore.count({ where: { reportUuid: trainingUuid } }),
    1,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/collection/training/" + session.uuid + "/submit",
        trainingReport,
      )
    ).status,
    200,
  );
  assert.equal(
    await db.trainingScore.count({ where: { reportUuid: trainingUuid } }),
    1,
  );
  assert.equal(
    (
      await db.analysisRevision.findUniqueOrThrow({
        where: { teamNumber: robot },
      })
    ).revision,
    1n,
  );
  const privateSnapshot = await call(
    "GET",
    "/collection/training/sessions/" +
      session.uuid +
      "?attempt=" +
      participant.attemptUuid,
    undefined,
    attemptHeaders,
  );
  assert.equal(privateSnapshot.status, 200);
  assert.equal((await privateSnapshot.json()).participants.length, 1);
  assert.equal(
    (
      await call(
        "GET",
        "/collection/training/sessions/" + session.uuid,
        undefined,
        { Authorization: "Bearer invalid" },
      )
    ).status,
    404,
  );

  const socket = new WebSocket(
    base.replace("http:", "ws:") + "/collection/training/socket",
    { origin: "https://allowed.example" },
  );
  await once(socket, "open");
  const initial = once(socket, "message");
  socket.send(
    JSON.stringify({ sessionUuid: session.uuid, token: session.browserToken }),
  );
  const [raw] = await initial;
  assert.equal(JSON.parse(raw.toString()).uuid, session.uuid);
  const closing = once(socket, "close");
  socket.close();
  await closing;
  const rejected = new WebSocket(
    base.replace("http:", "ws:") + "/collection/training/socket",
    { origin: "https://allowed.example" },
  );
  await once(rejected, "open");
  const denial = once(rejected, "close");
  rejected.send(
    JSON.stringify({ sessionUuid: session.uuid, token: "x".repeat(43) }),
  );
  assert.equal((await denial)[0], 1008);

  const pathsResponse = await call(
    "GET",
    "/v1/analysis/metric/autoPoints/team/" + robot,
  );
  assert.equal(pathsResponse.status, 200);
  assert.equal((await pathsResponse.json()).paths.length, 1);
  const reportExport = await call(
    "GET",
    "/v1/analysis/reportcsv?tournamentKey=" + eventKey,
  );
  assert.equal(reportExport.status, 200);
  assert.ok((await reportExport.text()).includes("Synthetic test"));
  const partialExport = await call(
    "GET",
    "/v1/analysis/csvplain?tournamentKey=" + eventKey + "&auto=true",
  );
  assert.equal(partialExport.status, 200);
  assert.ok((await partialExport.text()).includes(String(robot)));
  assert.equal(
    (await call("GET", "/v1/analysis/metric/not-a-metric/team/" + robot))
      .status,
    400,
  );
  assert.deepEqual(
    await (
      await call(
        "GET",
        "/v1/analysis/flag/team/" +
          robot +
          "?flags=" +
          encodeURIComponent(JSON.stringify(["rank"])),
      )
    ).json(),
    [0],
  );
  const onboardingActor = actorId + "-onboarding";
  await db.user.create({
    data: { id: onboardingActor, email: suffix + "-new@example.invalid" },
  });
  const newbie = { Authorization: "Bearer newbie" };
  assert.equal(
    (
      await call(
        "POST",
        "/v1/manager/onboarding/team",
        { number: robot, email: suffix + "-team@example.invalid" },
        newbie,
      )
    ).status,
    200,
  );
  const verification = await db.emailVerificationRequest.findFirstOrThrow({
    where: { teamNumber: robot },
  });
  assert.equal(
    await db.apiOutbox.count({
      where: { dedupeKey: "verify:" + verification.verificationCode },
    }),
    1,
  );
  const path = "/v1/manager/onboarding/verifyemail",
    verifyBody = { code: verification.verificationCode },
    timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "test-signing-key")
    .update(
      JSON.stringify({
        path,
        method: "POST",
        body: JSON.stringify(verifyBody),
        timestamp,
      }),
    )
    .digest("hex");
  assert.equal(
    (
      await call("POST", path, verifyBody, {
        "X-Timestamp": String(timestamp),
        "X-Signature": signature,
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.registeredTeam.findUniqueOrThrow({ where: { number: robot } }))
      .emailVerified,
    true,
  );
  const joinActor = actorId + "-join";
  await db.user.create({
    data: { id: joinActor, email: suffix + "-join@example.invalid" },
  });
  assert.equal(
    (
      await call(
        "POST",
        "/v1/manager/onboarding/teamcode?team=" + own + "&code=" + suffix + own,
        undefined,
        { Authorization: "Bearer join" },
      )
    ).status,
    200,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: joinActor } })).teamNumber,
    own,
  );
});
