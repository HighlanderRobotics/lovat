/* global require, __dirname, Response, DOMException */
/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads the app's TypeScript without a new dependency. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(outputText, filename);
};
let request;
require.cache[path.resolve(__dirname, "../lib/lovatAPI/lovatAPI.ts")] = {
  exports: { get: (...args) => request(...args) },
};
const { checkMatchExists } = require("../lib/lovatAPI/checkMatchExists.ts");
const { getMatchSchedule } = require("../lib/lovatAPI/getMatchSchedule.ts");
const { MatchType } = require("../lib/models/match.ts");
const meta = {
  scouterUUID: "test-scouter",
  teamNumber: 8033,
  allianceColor: "RED",
  matchIdentity: {
    tournamentKey: "2026test",
    matchNumber: 3,
    matchType: MatchType.Qualifier,
  },
};
const matchResponse = (matchType, alliance = "blue") =>
  Response.json({
    match: {
      tournamentKey: "2026test",
      matchNumber: 3,
      teamNumber: 8033,
      matchType,
    },
    alliance,
  });

test("fresh checks use the selected match type and correct official alliance", async () => {
  for (const [type, wire] of [
    [MatchType.Qualifier, "QUALIFICATION"],
    [MatchType.Elimination, "ELIMINATION"],
    [MatchType.Practice, "PRACTICE"],
  ]) {
    request = async (url) => {
      assert.ok(url.includes(`matchType=${wire}`));
      assert.ok(url.includes("teamNumber=8033"));
      return matchResponse(wire, type === MatchType.Practice ? null : "blue");
    };
    assert.deepEqual(
      await checkMatchExists({
        ...meta,
        matchIdentity: { ...meta.matchIdentity, matchType: type },
      }),
      {
        status: "exists",
        allianceColor: type === MatchType.Practice ? "RED" : "BLUE",
      },
    );
  }
});
test("a confirmed missing match blocks starting", async () => {
  request = async () => new Response("MATCH_NOT_FOUND", { status: 404 });
  for (const matchType of Object.values(MatchType)) {
    assert.deepEqual(
      await checkMatchExists({
        ...meta,
        matchIdentity: { ...meta.matchIdentity, matchType },
      }),
      { status: "missing" },
    );
  }
});
test("disconnection allows starting even without a cached schedule", async () => {
  request = async () => {
    throw new TypeError("Network request failed");
  };
  assert.deepEqual(await checkMatchExists(meta), { status: "offline" });
});
test("an unresponsive connection times out instead of preventing offline scouting", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  request = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  const result = checkMatchExists(meta);
  t.mock.timers.tick(15000);
  assert.deepEqual(await result, { status: "offline" });
});
test("HTTP errors and unexpected 404 pages are not mistaken for offline", async () => {
  for (const status of [401, 404, 429, 500, 503]) {
    request = async () => new Response("Error", { status });
    await assert.rejects(checkMatchExists(meta), /Unable to verify/);
  }
});
test("malformed or mismatched match results cannot authorize a report", async () => {
  for (const value of [
    {},
    {
      match: {
        tournamentKey: "other",
        matchNumber: 3,
        teamNumber: 8033,
        matchType: "QUALIFICATION",
      },
      alliance: "red",
    },
  ]) {
    request = async () => Response.json(value);
    await assert.rejects(checkMatchExists(meta));
  }
});
test("schedule parsing preserves practice teams without inventing alliance positions", async () => {
  const schedule = {
    tournamentKey: "2026test",
    matches: [
      {
        matchNumber: 3,
        matchType: 2,
        teams: [{ number: 8033, alliance: null }],
      },
    ],
  };
  request = async () => Response.json(schedule);
  assert.deepEqual(await getMatchSchedule("2026test"), schedule);
  await assert.rejects(getMatchSchedule("other"), /Unexpected tournament/);
});
