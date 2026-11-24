import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

// Compile the production modules so the test uses the real event enum instead
// of a copy that could drift from the report wire format.
function compile(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
}

const eventTypeExports = {};
runInNewContext(compile("../lib/collection/MatchEventType.ts"), {
  exports: eventTypeExports,
  require,
});

const matchScoreExports = {};
runInNewContext(compile("../lib/collection/matchScore.ts"), {
  exports: matchScoreExports,
  require(name) {
    if (name.endsWith("/MatchEventType")) return eventTypeExports;
    return require(name);
  },
});

const { totalScoredPoints } = matchScoreExports;
const { MatchEventType } = eventTypeExports;

function event(type, quantity) {
  return { type, position: 0, timestamp: 0, quantity };
}

test("an empty report scores nothing", () => {
  assert.equal(totalScoredPoints([]), 0);
});

test("adds the quantity of every scoring stop event", () => {
  assert.equal(
    totalScoredPoints([
      event(MatchEventType.StopScoring, 12),
      event(MatchEventType.StopScoring, 30),
      event(MatchEventType.StopScoring, 8),
    ]),
    50,
  );
});

test("ignores non-scoring events and their quantities", () => {
  assert.equal(
    totalScoredPoints([
      event(MatchEventType.StartScoring),
      event(MatchEventType.StopScoring, 15),
      event(MatchEventType.StopFeeding, 40),
      event(MatchEventType.Climb),
      event(MatchEventType.Cross),
    ]),
    15,
  );
});

test("treats a scoring event without a quantity as zero", () => {
  assert.equal(totalScoredPoints([event(MatchEventType.StopScoring)]), 0);
});
