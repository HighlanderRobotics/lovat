/* eslint-disable @typescript-eslint/no-require-imports -- Jest loads these migrated CommonJS regressions and native mocks synchronously. */
const { test } = require("@jest/globals");
const assert = require("node:assert/strict");

let request;
jest.doMock("../lib/lovatAPI/lovatAPI.ts", () => ({
  get: (...args) => request(...args),
}));
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
