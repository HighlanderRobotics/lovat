/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Use the Node runner with the existing TypeScript compiler. */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
};
require.cache[require.resolve("expo-constants")] = {
  exports: { expoConfig: { version: "26.0.5" } },
};
const {
  useReportStateStore: store,
} = require("../lib/collection/reportStateStore.ts");
const {
  activeActivity,
  canScoreAt,
  currentLocation,
  heldPiece,
  eventSchema,
  chargedUpReportSchema,
} = require("../lib/collection/ChargedUp.ts");
const { scoutReportSchema } = require("../lib/collection/ScoutReport.ts");
const {
  migrateScoutReport,
} = require("../lib/storage/scoutReportMigrations.ts");
const { MatchType } = require("../lib/models/match.ts");
const meta = {
  scouterUUID: "scouter",
  teamNumber: 8033,
  allianceColor: "BLUE",
  matchIdentity: {
    tournamentKey: "2023mock",
    matchNumber: 1,
    matchType: MatchType.Practice,
  },
};
beforeEach(() => store.getState().reset());
function start() {
  store.getState().scoutMatch(meta);
  store.getState().setStartPosition(50);
  store.getState().initializeMatchTimestamp();
}
test("drag position is required, accepts endpoints, and cannot change after start", () => {
  store.getState().scoutMatch(meta);
  store.getState().initializeMatchTimestamp();
  assert.equal(store.getState().startTimestamp, undefined);
  store.getState().setStartPosition(0);
  store.getState().initializeMatchTimestamp();
  store.getState().setStartPosition(100);
  assert.equal(store.getState().startPosition, 0);
  assert.equal(store.getState().exportScoutReport().events[0].position, 0);
  store.getState().restartMatch();
  store.getState().setStartPosition(100);
  store.getState().initializeMatchTimestamp();
  assert.equal(store.getState().exportScoutReport().events[0].position, 100);
});
test("all three areas serialize their own 3 by 3 scoring grid, without server-generated points", () => {
  start();
  for (const column of "ABCDEFGHI")
    for (const row of [1, 2, 3]) {
      const cube = row === 3 || "BEH".includes(column);
      store.getState().addEvent({
        action: cube ? "INTAKE_CUBE" : "INTAKE_CONE",
        location: "ALLIANCE_ZONE",
      });
      store.getState().addEvent({
        action: cube ? "SCORE_CUBE" : "SCORE_CONE",
        location: "SCORE",
        scoringLocation: `${column}${row}`,
      });
    }
  const report = store.getState().exportScoutReport();
  assert.equal(report.events.length, 55);
  assert.equal(report.matchType, "PRACTICE");
  assert.equal(report.gameYear, 2023);
  assert.equal(report.events.at(-1).scoringLocation, "I3");
  assert.ok(report.events.every((event) => !("points" in event)));
  assert.deepEqual(
    scoutReportSchema.parse(JSON.parse(JSON.stringify(report))),
    report,
  );
});
test("undo restores field movement and the held piece", () => {
  start();
  const state = () => store.getState();
  state().addEvent({ action: "LEAVE_ZONE", location: "ALLIANCE_ZONE" });
  state().addEvent({ action: "INTAKE_CONE", location: "CENTER" });
  state().addEvent({ action: "ENTER_ZONE", location: "ALLIANCE_ZONE" });
  state().addEvent({
    action: "SCORE_CONE",
    location: "SCORE",
    scoringLocation: "A1",
  });
  assert.equal(heldPiece(state().events), null);
  state().undoEvent();
  assert.equal(heldPiece(state().events), "CONE");
  state().undoEvent();
  assert.equal(currentLocation(state().events), "CENTER");
  state().undoEvent();
  state().undoEvent();
  assert.equal(currentLocation(state().events), "ALLIANCE_ZONE");
});
test("restart preserves match identity and clears timeline, position, setup, and post-match fields", () => {
  start();
  const uuid = store.getState().uuid;
  store
    .getState()
    .setPostMatch({ links: 5, coopertition: true, defenseEffectiveness: 5 });
  store.getState().addEvent({ action: "ENDGAME", location: "CHARGER" });
  store.getState().restartMatch();
  assert.deepEqual(store.getState().meta, meta);
  assert.notEqual(store.getState().uuid, uuid);
  assert.equal(store.getState().links, 0);
  assert.equal(store.getState().startPosition, undefined);
  assert.equal(store.getState().events.length, 0);
  store.getState().reset();
  assert.equal(store.getState().meta, undefined);
});
test("2023 reports bypass numeric-event migrations and validate post-match ranges", () => {
  start();
  const report = store.getState().exportScoutReport();
  assert.equal(migrateScoutReport(report), report);
  assert.equal(
    chargedUpReportSchema.safeParse({ ...report, defenseEffectiveness: 6 })
      .success,
    false,
  );
  assert.equal(
    chargedUpReportSchema.safeParse({ ...report, links: -1 }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({
      time: 0,
      action: "SCORE_CONE",
      location: "SCORE",
      scoringLocation: "J1",
    }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({
      time: 0,
      action: "INTAKE_CUBE",
      location: "CENTER",
      position: 50,
    }).success,
    false,
  );
});
test("existing 2026 history remains readable with its original tuple payload", () => {
  const legacy = {
    uuid: "old",
    appVersion: "26.0.5",
    tournamentKey: "2026mock",
    matchType: "QUALIFICATION",
    matchNumber: 1,
    startTime: 1,
    teamNumber: 8033,
    scouterUuid: "scouter",
    notes: "preserve",
    robotBrokeDescription: null,
    robotRoles: ["CYCLING"],
    mobility: "BOTH",
    disrupts: false,
    accuracy: 3,
    autoClimb: "NOT_ATTEMPTED",
    intakeType: "GROUND",
    feederTypes: [],
    beached: "NEITHER",
    defenseEffectiveness: 3,
    scoresWhileMoving: false,
    endgameClimb: "NOT_ATTEMPTED",
    driverAbility: 3,
    events: [
      [0, 2, 2],
      [3, 0, 8],
      [4, 1, 8, 10],
    ],
  };
  assert.deepEqual(scoutReportSchema.parse(legacy), legacy);
  assert.deepEqual(migrateScoutReport(legacy).events, legacy.events);
  assert.equal("gameYear" in migrateScoutReport(legacy), false);
});

test("piece state rejects extra intake, empty drops, wrong pieces, wrong nodes and scoring outside community", () => {
  store.getState().scoutMatch(meta);
  store.getState().setPreloadedPiece("CONE");
  store.getState().setStartPosition(20);
  store.getState().initializeMatchTimestamp();
  const state = () => store.getState();
  state().setPreloadedPiece("CUBE");
  assert.equal(heldPiece(state().events, state().preloadedPiece), "CONE");
  assert.equal(
    state().addEvent({ action: "INTAKE_CUBE", location: "CENTER" }),
    false,
  );
  for (const [action, node] of [
    ["SCORE_CUBE", "B1"],
    ["SCORE_CONE", "B2"],
  ])
    assert.equal(
      state().addEvent({ action, location: "SCORE", scoringLocation: node }),
      false,
    );
  state().addEvent({ action: "LEAVE_ZONE", location: "ALLIANCE_ZONE" });
  assert.equal(
    state().addEvent({
      action: "SCORE_CONE",
      location: "SCORE",
      scoringLocation: "A1",
    }),
    false,
  );
  state().addEvent({ action: "ENTER_ZONE", location: "ALLIANCE_ZONE" });
  assert.equal(
    state().addEvent({
      action: "SCORE_CONE",
      location: "SCORE",
      scoringLocation: "A1",
    }),
    true,
  );
  assert.equal(
    state().addEvent({ action: "DROP", location: "ALLIANCE_ZONE" }),
    false,
  );
  state().undoEvent();
  assert.equal(heldPiece(state().events, state().preloadedPiece), "CONE");
  assert.equal(state().exportScoutReport().preloadedPiece, "CONE");
  state().restartMatch();
  assert.equal(state().preloadedPiece, null);
});
test("all 27 nodes follow the manual's cone, cube and hybrid restrictions", () => {
  for (const column of "ABCDEFGHI")
    for (const row of [1, 2, 3]) {
      const node = `${column}${row}`;
      assert.equal(canScoreAt(null, node), false);
      assert.equal(
        canScoreAt("CUBE", node),
        row === 3 || "BEH".includes(column),
      );
      assert.equal(
        canScoreAt("CONE", node),
        row === 3 || !"BEH".includes(column),
      );
    }
});
test("holds record paired intervals, ignore duplicate release, block actions and undo together", () => {
  start();
  const state = () => store.getState();
  for (const [activity, location] of [
    ["DEFENDING", "OPPONENT_ZONE"],
    ["CAMPING", "OPPONENT_STATION"],
  ]) {
    state().startHold(activity, location);
    state().startHold(activity, location);
    assert.equal(activeActivity(state().events), activity);
    assert.equal(
      state().addEvent({ action: "INTAKE_CONE", location: "CENTER" }),
      false,
    );
    assert.equal(
      state().addEvent({ action: "ENTER_ZONE", location: "ALLIANCE_ZONE" }),
      false,
    );
    state().undoEvent();
    assert.equal(state().events.length, 1);
    state().stopHold();
    state().stopHold();
    assert.equal(activeActivity(state().events), null);
    assert.equal(state().events.length, 2);
    assert.ok(state().events[1].time >= state().events[0].time);
    state().undoEvent();
    assert.equal(state().events.length, 0);
  }
});
