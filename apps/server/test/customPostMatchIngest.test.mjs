import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";

const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/lovat_test"
)
  throw new Error(
    "Use LOVAT_DB_TEST=1 and a disposable local lovat_test database",
  );

// Report ingestion should not contact external cache or notification services.
mock.module(new URL("../dist/src/redisClient.js", import.meta.url).href, {
  namedExports: {
    kv: {
      get: async () => null,
      set: async () => "OK",
      del: async () => 0,
      setEx: async () => "OK",
    },
  },
});
mock.module(
  new URL(
    "../dist/src/handler/slack/sendWarningNotification.js",
    import.meta.url,
  ).href,
  {
    namedExports: {
      sendWarningToSlack: async () => {
        throw new Error("Unexpected notification");
      },
    },
  },
);
const { db } = await import("@lovat/db");
const { addScoutReport } =
  await import("../dist/src/handler/manager/scoutreports/addScoutReport.js");
const { addScoutReportDashboard } =
  await import("../dist/src/handler/manager/scoutreports/addScoutReportDashboard.js");
const { getReportCSV } =
  await import("../dist/src/handler/analysis/csv/getReportCSV.js");
const { customPostMatchHandlers } =
  await import("../dist/src/handler/manager/teamCustomPostMatch.js");
const { getScoutReport } =
  await import("../dist/src/handler/manager/scoutreports/getScoutReport.js");
const { matchPageSpecificScouter } =
  await import("../dist/src/handler/analysis/specificMatchPage/matchPageSpecificScouter.js");
const sourceTeam = -Math.floor(Math.random() * 1000000000) - 1;
const scouterUuid = randomUUID();
const tournamentKey = "custom-post-match-" + randomUUID();
const code = randomUUID();
let user;
function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    header(key, value) {
      this.headers[key] = value;
      return this;
    },
    attachment() {
      return this;
    },
  };
}
const body = (customPostMatch) => ({
  uuid: randomUUID(),
  tournamentKey,
  matchType: "QUALIFICATION",
  matchNumber: 1,
  startTime: Date.now(),
  notes: "",
  robotRoles: [],
  mobility: "NONE",
  beached: "NEITHER",
  feederTypes: [],
  intakeType: "NEITHER",
  robotBrokeDescription: null,
  driverAbility: 3,
  accuracy: null,
  disrupts: false,
  defenseEffectiveness: 3,
  scoresWhileMoving: false,
  autoClimb: "NOT_ATTEMPTED",
  endgameClimb: "NOT_ATTEMPTED",
  scouterUuid,
  teamNumber: sourceTeam,
  events: [],
  ...(customPostMatch === undefined ? {} : { customPostMatch }),
});
before(async () => {
  await db.team.create({
    data: { number: sourceTeam, name: "Custom question test" },
  });
  await db.registeredTeam.create({
    data: { number: sourceTeam, code, email: code + "@example.invalid" },
  });
  await db.scouter.create({
    data: { uuid: scouterUuid, sourceTeamNumber: sourceTeam },
  });
  user = await db.user.create({
    data: {
      id: randomUUID(),
      email: randomUUID() + "@example.invalid",
      teamNumber: sourceTeam,
      role: "SCOUTING_LEAD",
    },
  });
  await db.tournament.create({
    data: { key: tournamentKey, name: "Custom question test" },
  });
  await db.teamMatchData.create({
    data: {
      key: tournamentKey + "_qm1_0",
      tournamentKey,
      matchNumber: 1,
      matchType: "QUALIFICATION",
      teamNumber: sourceTeam,
    },
  });
});
after(async () => {
  await db.tournament.deleteMany({ where: { key: tournamentKey } });
  await db.team.deleteMany({ where: { number: sourceTeam } });
  await db.$disconnect();
});

test("new teams default to no questions and PostgreSQL rejects a fourth question", async () => {
  assert.deepEqual(
    (
      await db.registeredTeam.findUniqueOrThrow({
        where: { number: sourceTeam },
      })
    ).customPostMatch,
    [],
  );
  await assert.rejects(
    db.registeredTeam.update({
      where: { number: sourceTeam },
      data: { customPostMatch: ["1", "2", "3", "4"] },
    }),
  );
});

test("Collection and QR/Dashboard ingest persist snapshots after the lead edits or removes questions", async () => {
  const changed = response();
  await customPostMatchHandlers.update(
    { user, tokenType: "jwt", body: { customPostMatch: ["New wording"] } },
    changed,
  );
  assert.equal(changed.statusCode, 200);
  for (const handler of [addScoutReport, addScoutReportDashboard]) {
    const report = body([
      {
        question: 'Old question, "before edit"',
        answer: "Free text, with commas\nand a newline",
      },
    ]);
    const res = response();
    await handler(
      {
        user,
        tokenType: "jwt",
        headers: { "x-team-code": code },
        body: report,
      },
      res,
    );
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(
      (await db.scoutReport.findUniqueOrThrow({ where: { uuid: report.uuid } }))
        .customPostMatch,
      report.customPostMatch,
    );
  }
  const cleared = response();
  await customPostMatchHandlers.update(
    { user, tokenType: "jwt", body: { customPostMatch: [] } },
    cleared,
  );
  assert.equal(cleared.statusCode, 200);
});

test("old uploads still work; invalid or cross-team custom answers are rejected before creating a report", async () => {
  const old = body();
  const legacy = response();
  await addScoutReport({ headers: {}, body: old }, legacy);
  assert.equal(legacy.statusCode, 200, JSON.stringify(legacy.body));
  assert.deepEqual(
    (await db.scoutReport.findUniqueOrThrow({ where: { uuid: old.uuid } }))
      .customPostMatch,
    [],
  );
  for (const handler of [addScoutReport, addScoutReportDashboard]) {
    const report = body(
      Array.from({ length: 4 }, (_, i) => ({
        question: String(i),
        answer: "yes",
      })),
    );
    const res = response();
    await handler(
      { user, headers: { "x-team-code": code }, body: report },
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(
      await db.scoutReport.count({ where: { uuid: report.uuid } }),
      0,
    );
  }
  const report = body([{ question: "Question", answer: "Answer" }]);
  const denied = response();
  await addScoutReport(
    { headers: { "x-team-code": "wrong" }, body: report },
    denied,
  );
  assert.equal(denied.statusCode, 403);
  assert.equal(await db.scoutReport.count({ where: { uuid: report.uuid } }), 0);
});

test("individual report and Dashboard overview return the stored question snapshots", async () => {
  const report = await db.scoutReport.findFirstOrThrow({
    where: { scouterUuid, customPostMatch: { not: [] } },
  });
  const raw = response();
  await getScoutReport({ user, params: { uuid: report.uuid } }, raw);
  assert.equal(raw.statusCode, 200);
  assert.deepEqual(
    raw.body.scoutReport.customPostMatch,
    report.customPostMatch,
  );
  const overview = response();
  await matchPageSpecificScouter(
    { user, params: { uuid: report.uuid }, query: {}, body: {} },
    overview,
  );
  assert.equal(overview.statusCode, 200, JSON.stringify(overview.body));
  assert.deepEqual(overview.body.customPostMatch, report.customPostMatch);
  await assert.rejects(
    db.scoutReport.update({
      where: { uuid: report.uuid },
      data: {
        customPostMatch: Array.from({ length: 4 }, (_, i) => ({
          question: String(i),
          answer: "too many",
        })),
      },
    }),
  );
});

test("report CSV includes historical wording and answers while retaining source-team filtering", async () => {
  const res = response();
  await getReportCSV(
    {
      user: {
        ...user,
        teamSourceRule: { mode: "INCLUDE", items: [sourceTeam] },
      },
      query: { tournamentKey },
    },
    res,
  );
  assert.equal(res.statusCode, 200, String(res.body));
  assert.ok(res.body.includes("customQuestion1"));
  assert.ok(res.body.includes('"Old question, ""before edit"""'));
  assert.ok(res.body.includes('"Free text, with commas\nand a newline"'));
  const excluded = response();
  await getReportCSV(
    {
      user: {
        ...user,
        teamSourceRule: { mode: "EXCLUDE", items: [sourceTeam] },
      },
      query: { tournamentKey },
    },
    excluded,
  );
  assert.equal(excluded.statusCode, 400);
});
