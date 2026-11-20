import { test } from "node:test";
import assert from "node:assert/strict";
import { game2026, legacyAnalysisInput, season2026 } from "@lovat/games/2026";
import { compareReportGroups } from "@lovat/games";
import { createRepository } from "../dist/repository.js";
import { streamGameReports } from "../dist/gameStorage.js";
import { createAnalysisService } from "../dist/analysis.js";
import { fictionalGame } from "../../../packages/games/test/fixtures.mjs";
import { report, event, scope } from "./fixtures.mjs";

test("streamed 2026 metrics preserve every value, missing sample, dependency and recency weight", async () => {
  const reports = Array.from({ length: 90 }, (_, i) =>
    legacyAnalysisInput(
      report({
        uuid: String(i),
        teamNumber: 8033 + (i % 3),
        matchKey: "qm" + (Math.floor(i / 3) % 5),
        tournamentKey: "event" + Math.floor(i / 30),
        tournamentDate: "2026-03-0" + (1 + Math.floor(i / 30)),
        accuracy: i % 7 === 0 ? null : i % 6,
        autoClimb: i % 2 ? "SUCCEEDED" : "FAILED",
        endgameClimb: i % 2 ? "L2" : "NOT_ATTEMPTED",
        robotRoles: i % 2 ? ["SCORING", "FEEDING"] : ["DEFENDING"],
        events: [
          event("START_SCORING", 10),
          event("STOP_SCORING", 20, i),
          event("START_SCORING", 25),
          event("STOP_SCORING", 35, 10),
          event("CLIMB", 140),
        ],
      }),
    ),
  );
  const request = {
    teams: [8033, 8034, 8035, 9999],
    season: 2026,
    metrics: season2026.metadata().map((metric) => metric.id),
    timeline: true,
  };
  const expected = game2026.analyze([...reports].reverse(), request);
  async function* stream() {
    for (const row of [...reports].reverse().sort(compareReportGroups))
      yield row;
  }
  assert.deepEqual(await game2026.analyzeStream(stream(), request), expected);
});
test("unordered streams fail closed and close their source", async () => {
  let closed = false;
  const rows = [
    legacyAnalysisInput(report({ matchKey: "qm2" })),
    legacyAnalysisInput(report({ matchKey: "qm1" })),
  ];
  async function* stream() {
    try {
      yield* rows;
    } finally {
      closed = true;
    }
  }
  await assert.rejects(
    game2026.analyzeStream(stream(), {
      teams: [8033],
      season: 2026,
      metrics: ["totalPoints"],
      timeline: true,
    }),
    /must be ordered/,
  );
  assert.equal(closed, true);
});
test("analysis service consumes the stream without calling the buffering fallback", async () => {
  let read = 0;
  const analyze = createAnalysisService({
    loadReports: async () => {
      throw Error("Unexpected buffering");
    },
    async *streamReports() {
      read++;
      yield legacyAnalysisInput(report());
    },
  });
  const response = await analyze(scope, {
    teams: [8033],
    season: 2026,
    metrics: ["driverAbility"],
    timeline: false,
  });
  assert.equal(response.teams["8033"].metrics.driverAbility.value, 3);
  assert.equal(read, 1);
});
const metadata = (count) =>
  Array.from({ length: count }, (_, i) => ({
    ...report({ uuid: String(i).padStart(4, "0") }),
    teamMatchData: {
      teamNumber: 8033,
      key: "qm1",
      tournamentKey: "2026test",
      tournament: { date: "2026-03-01" },
    },
  }));
function legacyDb(rows, event, snapshots = []) {
  const db = {
    scoutReport: {
      findMany: async (query) => {
        if (!query.select.teamMatchKey) return rows;
        snapshots.push(query);
        return rows
          .filter((row) => query.where.AND[1].uuid.in.includes(row.uuid))
          .map((row) => ({
            uuid: row.uuid,
            teamMatchKey: row.teamMatchData.key,
          }));
      },
    },
    event,
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "RepeatableRead");
      return callback(db);
    },
  };
  return db;
}
test("legacy stream bounds hydrated events and stops fetching when its consumer closes", async () => {
  const rows = metadata(1600),
    queries = [],
    snapshots = [];
  const repository = createRepository(
    legacyDb(
      rows,
      {
        groupBy: async () =>
          rows.map((row) => ({
            scoutReportUuid: row.uuid,
            _count: { _all: 20 },
          })),
        findMany: async (query) => {
          queries.push(query);
          return query.where.scoutReportUuid.in.flatMap((uuid) =>
            Array.from({ length: 20 }, (_, time) => ({
              scoutReportUuid: uuid,
              ...event("INTAKE", time),
            })),
          );
        },
      },
      snapshots,
    ),
  );
  const iterator = repository
    .streamReports(scope, { teams: [8033], season: 2026 }, new Set(["events"]))
    [Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.uuid, "0000");
  await iterator.return();
  assert.equal(queries.length, 1);
  assert.ok(queries[0].where.scoutReportUuid.in.length <= 1000);
  assert.ok(queries[0].take <= 20001);
  assert.equal(snapshots[0].where.AND[0].training, false);
  assert.deepEqual(snapshots[0].where.AND[0].scouter.sourceTeamNumber, {
    in: [8033],
  });
});
test("event preflight rejects total and individual limits before hydrating payloads", async () => {
  for (const [count, perReport] of [
    [20, 6000],
    [1, 10001],
  ]) {
    const rows = metadata(count);
    const repository = createRepository({
      scoutReport: { findMany: async () => rows },
      event: {
        groupBy: async () =>
          rows.map((row) => ({
            scoutReportUuid: row.uuid,
            _count: { _all: perReport },
          })),
        findMany: async () => {
          throw Error("Must reject before reading events");
        },
      },
    });
    await assert.rejects(
      repository.loadReports(
        scope,
        { teams: [8033], season: 2026 },
        new Set(["events"]),
      ),
      { code: "ANALYSIS_TOO_LARGE" },
    );
  }
});
test("a report that grows after event preflight is rejected before producing a result", async () => {
  const repository = createRepository(
    legacyDb(metadata(1), {
      groupBy: async () => [{ scoutReportUuid: "0000", _count: { _all: 1 } }],
      findMany: async () => [{}, {}],
    }),
  );
  await assert.rejects(
    repository.loadReports(
      scope,
      { teams: [8033], season: 2026 },
      new Set(["events"]),
    ),
    { code: "ANALYSIS_CHANGED" },
  );
});
const genericRows = () =>
  metadata(3).map((row) => ({
    ...row,
    gameId: fictionalGame.descriptor.id,
    gameVersion: 1,
    reportVersion: 2,
  }));
test("generic JSON streams use byte budgets and repeat tenant restrictions on each payload read", async () => {
  const rows = genericRows(),
    queries = [];
  const db = {
    $queryRaw: async () =>
      rows.map((row) => ({ uuid: row.uuid, bytes: 300000 })),
    gameReport: {
      findMany: async (query) => {
        if (!query.select.data) return rows;
        queries.push(query);
        return query.where.AND[1].uuid.in.map((uuid) => ({
          uuid,
          data: { throws: [], balanced: false },
        }));
      },
    },
  };
  const stream = streamGameReports(
    db,
    scope,
    { teams: [8033], season: 2099 },
    fictionalGame,
  );
  const response = await fictionalGame.analyzeStream(stream, {
    teams: [8033],
    season: 2099,
    metrics: ["points"],
    timeline: true,
  });
  assert.equal(response.teams["8033"].metrics.glyphScore.value, 0);
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.deepEqual(query.where.AND[0].scouter.sourceTeamNumber, {
      in: [8033],
    });
    assert.equal(query.where.AND[0].training, false);
    assert.equal(query.where.AND[0].gameId, fictionalGame.descriptor.id);
  }
});
test("generic JSON preflight rejects oversized report payloads before loading data", async () => {
  const db = {
    $queryRaw: async () => [{ uuid: "0000", bytes: 3 * 1024 * 1024 }],
    gameReport: {
      findMany: async (query) => {
        if (query.select.data) throw Error("Unexpected payload read");
        return genericRows();
      },
    },
  };
  await assert.rejects(
    fictionalGame.analyzeStream(
      streamGameReports(
        db,
        scope,
        { teams: [8033], season: 2099 },
        fictionalGame,
      ),
      { teams: [8033], season: 2099, metrics: ["points"], timeline: false },
    ),
    { code: "ANALYSIS_TOO_LARGE" },
  );
});

test("visibility changes between metadata and payload snapshots exclude the entire report", async () => {
  const db = legacyDb(metadata(1), {
    groupBy: async () => [{ scoutReportUuid: "0000", _count: { _all: 1 } }],
    findMany: async () => {
      throw Error("Invisible report events must not load");
    },
  });
  db.$transaction = async (callback) =>
    callback({ ...db, scoutReport: { findMany: async () => [] } });
  const analyze = createAnalysisService(createRepository(db));
  const response = await analyze(scope, {
    teams: [8033],
    season: 2026,
    metrics: ["totalPoints"],
    timeline: false,
  });
  assert.deepEqual(response.teams["8033"].metrics.totalPoints, {
    value: null,
    samples: 0,
    version: 1,
  });
});
