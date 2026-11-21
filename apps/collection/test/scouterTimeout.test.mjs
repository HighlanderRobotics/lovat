import { URL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { z } from "zod";
import { loadScouterServices } from "../lib/collection/startup.ts";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function fixture(get) {
  const timers = [];
  const cleared = [];
  const exports = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../lib/lovatAPI/getTeamScouters.ts", import.meta.url),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports,
      AbortController: globalThis.AbortController,
      setTimeout: (fn, delay) => {
        timers.push({ fn, delay });
        return timers.length;
      },
      clearTimeout: (id) => cleared.push(id),
      require: (name) =>
        name === "./lovatAPI"
          ? { get }
          : name === "../models/scouter"
            ? { scouterSchema: z.object({ uuid: z.string() }) }
            : require(name),
    },
  );
  return { fetch: exports.getTeamScouters, timers, cleared };
}

test("a stalled roster request is aborted so independent schedules can refresh", async () => {
  const roster = fixture(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  );
  const calls = [];
  const loading = loadScouterServices(
    { uuid: "scout" },
    {
      fetchTeamScouters: roster.fetch,
      fetchTournaments: async () => {
        calls.push("tournaments");
      },
      fetchScouterSchedule: async () => {
        calls.push("scouter schedule");
      },
      fetchMatchSchedule: async () => {
        calls.push("match schedule");
      },
      getTeamScouters: () => [],
    },
  );
  assert.equal(roster.timers[0].delay, 15000);
  roster.timers[0].fn();
  const result = await loading;
  assert.deepEqual(calls, [
    "tournaments",
    "scouter schedule",
    "match schedule",
  ]);
  assert.equal(result.invalidScouter, false);
  assert.match(String(result.error), /aborted/);
  assert.deepEqual(roster.cleared, [1]);
});

test("a successful roster request cancels its timeout", async () => {
  const roster = fixture(async () => ({
    ok: true,
    json: async () => [{ uuid: "scout" }],
  }));
  assert.deepEqual(await roster.fetch(), [{ uuid: "scout" }]);
  assert.deepEqual(roster.cleared, [1]);
});
