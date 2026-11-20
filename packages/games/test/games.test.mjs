import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  defineGame,
  GameCatalog,
  MetricRegistry,
  defineMetricFor,
  mean,
} from "../dist/index.js";
import { game2026 } from "../dist/2026/index.js";
import { fictionalGame } from "./fixtures.mjs";
const report = (data, overrides = {}) => ({
  uuid: "fixture",
  teamNumber: 8033,
  matchKey: "qm1",
  tournamentKey: "2099fixture",
  tournamentDate: "2099-03-01",
  gameId: "fixture-glyphs",
  gameVersion: 1,
  reportVersion: 2,
  data,
  ...overrides,
});
const request = {
  teams: [8033],
  metrics: ["points", "capability"],
  season: 2099,
  timeline: true,
};
test("different game fields, scoring and structured metrics use the unchanged generic engine", () => {
  const response = fictionalGame.analyze(
    [
      report({
        throws: [
          { zone: "high", count: 2 },
          { zone: "low", count: 3 },
        ],
        balanced: true,
      }),
      report(
        {
          throws: [
            { zone: "high", count: 1 },
            { zone: "low", count: 1 },
          ],
          balanced: false,
        },
        { uuid: "second" },
      ),
      report(
        {
          throws: [
            { zone: "high", count: 2 },
            { zone: "low", count: 3 },
          ],
          balanced: true,
        },
        { uuid: "third", matchKey: "qm2" },
      ),
    ],
    request,
  );
  assert.equal(response.teams["8033"].metrics.glyphScore.value, 27);
  assert.equal(response.teams["8033"].metrics.glyphScore.samples, 2);
  assert.deepEqual(response.teams["8033"].metrics.capability.value, {
    canBalance: true,
    capacity: 5,
  });
  assert.equal(response.teams["8033"].timeline.length, 2);
});
test("historical report schemas upgrade through their owning game module", () => {
  const response = fictionalGame.analyze(
    [report({ high: 2, low: 3, balanced: true }, { reportVersion: 1 })],
    request,
  );
  assert.equal(response.teams["8033"].metrics.glyphScore.value, 33);
  assert.deepEqual(Object.keys(fictionalGame.descriptor.reportSchemas), [
    "1",
    "2",
  ]);
  assert.equal(
    fictionalGame.descriptor.rules.periods.reduce(
      (n, p) => n + p.durationSeconds,
      0,
    ),
    75,
  );
});
test("game selection and report versions fail closed without changing another season", () => {
  const catalog = new GameCatalog([game2026, fictionalGame]);
  assert.equal(catalog.get(2026).descriptor.id, "frc-2026");
  assert.equal(catalog.get(2099).descriptor.id, "fixture-glyphs");
  assert.throws(
    () => catalog.get(2027),
    (e) => e.code === "UNSUPPORTED_GAME",
  );
  assert.throws(
    () =>
      fictionalGame.analyze(
        [report({ high: 1 }, { reportVersion: 7 })],
        request,
      ),
    (e) => e.code === "REPORT_VERSION_UNSUPPORTED",
  );
  assert.throws(
    () =>
      fictionalGame.analyze(
        [report({ throws: [], balanced: false }, { gameId: "another-game" })],
        request,
      ),
    (e) => e.code === "GAME_VERSION_MISMATCH",
  );
  assert.throws(
    () => fictionalGame.validate({ throws: [], balanced: "yes" }, 2),
    (e) => e.code === "INVALID_GAME_REPORT",
  );
  assert.throws(() => new GameCatalog([fictionalGame, fictionalGame]));
});
