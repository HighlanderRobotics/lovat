/* global require, __dirname, Response */
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
const { getMatchSchedule } = require("../lib/lovatAPI/getMatchSchedule.ts");
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
