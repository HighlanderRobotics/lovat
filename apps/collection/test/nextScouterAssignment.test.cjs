/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Load the pure schedule selector with the existing Node test runner. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
const {
  nextScouterAssignment,
} = require("../lib/collection/nextScouterAssignment.ts");
const { MatchType } = require("../lib/models/match.ts");
const identity = (
  matchNumber,
  matchType = MatchType.Qualifier,
  tournamentKey = "2023test",
) => ({ tournamentKey, matchNumber, matchType });
const meta = (
  matchNumber,
  teamNumber = 8033,
  matchType = MatchType.Qualifier,
) => ({
  scouterUUID: "one",
  teamNumber,
  allianceColor: "RED",
  matchIdentity: identity(matchNumber, matchType),
});
const match = (
  matchNumber,
  teamNumber,
  matchType = MatchType.Qualifier,
  scouter = "one",
) => ({
  matchIdentity: identity(matchNumber, matchType),
  scouters: { [scouter]: { teamNumber, allianceColor: "BLUE" } },
});
const schedule = (...data) => ({
  tournamentKey: "2023test",
  hash: "test",
  data,
});
test("selects the next assigned match in order, including its team and alliance", () => {
  const s = schedule(
    match(8, 118),
    match(4, 254),
    match(3, 111, MatchType.Qualifier, "other"),
    match(2, 8033),
  );
  assert.deepEqual(nextScouterAssignment(s, meta(2), []), {
    ...meta(4, 254),
    allianceColor: "BLUE",
  });
  assert.equal(s.data[0].matchIdentity.matchNumber, 8);
});
test("skips saved reports for this scouter and team even when upload failed", () => {
  const s = schedule(match(3, 254), match(4, 118));
  assert.equal(
    nextScouterAssignment(s, meta(2), [{ meta: meta(3, 254), uploaded: false }])
      .teamNumber,
    118,
  );
  assert.equal(
    nextScouterAssignment(s, meta(2), [
      { meta: { ...meta(3, 254), scouterUUID: "other" } },
    ]).teamNumber,
    254,
  );
  assert.equal(
    nextScouterAssignment(s, meta(2), [{ meta: meta(3, 999) }]).teamNumber,
    254,
  );
});
test("orders practice, qualifier and playoff assignments without wrapping", () => {
  const s = schedule(
    match(1, 118, MatchType.Elimination),
    match(1, 254),
    match(5, 111, MatchType.Practice),
  );
  assert.equal(
    nextScouterAssignment(s, meta(5, 111, MatchType.Practice), []).matchIdentity
      .matchType,
    MatchType.Qualifier,
  );
  assert.equal(
    nextScouterAssignment(s, meta(1, 254), []).matchIdentity.matchType,
    MatchType.Elimination,
  );
  assert.equal(
    nextScouterAssignment(s, meta(1, 118, MatchType.Elimination), []),
    null,
  );
});
test("never uses a different tournament, missing schedule or another scouter's assignment", () => {
  assert.equal(nextScouterAssignment(undefined, meta(1), []), null);
  assert.equal(
    nextScouterAssignment(
      { ...schedule(match(2, 254)), tournamentKey: "other" },
      meta(1),
      [],
    ),
    null,
  );
  assert.equal(
    nextScouterAssignment(
      schedule(match(2, 254, MatchType.Qualifier, "other")),
      meta(1),
      [],
    ),
    null,
  );
  assert.equal(
    nextScouterAssignment(
      schedule({
        ...match(2, 254),
        matchIdentity: identity(2, MatchType.Qualifier, "other"),
      }),
      meta(1),
      [],
    ),
    null,
  );
});
