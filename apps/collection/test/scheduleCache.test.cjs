/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real store with isolated native and HTTP dependencies. */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { create } = require("zustand");
require.extensions[".ts"] = (module, filename) =>
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
const mock = (file, exports) => {
  require.cache[path.resolve(__dirname, file)] = { exports };
};
const team = create(() => ({ number: 8033, code: "private" }));
const scouter = create(() => ({ value: { uuid: "one" } }));
const tournament = create(() => ({ value: { key: "2023a" } }));
const api = create(() => ({ getUrlPrefix: () => "https://example.test" }));
let calls = 0;
let request;
let persisted;
mock("../lib/storage/userStores.ts", {
  useTeamStore: team,
  useScouterStore: scouter,
  useTournamentStore: tournament,
});
mock("../lib/storage/zustandStorage.ts", {
  storage: {
    getItem: () => null,
    setItem: (_key, value) => {
      persisted = value;
    },
    removeItem: () => {},
  },
});
mock("../lib/lovatAPI/lovatAPI.ts", { useUrlPrefix: api });
mock("../lib/lovatAPI/getMatchSchedule.ts", {
  getMatchSchedule: (...args) => {
    calls++;
    return request(...args);
  },
});
mock("../lib/network/connectivity.ts", {
  useConnectivityStore: create(() => ({ status: "online" })),
});
const {
  useConnectivityStore: connectivity,
} = require("../lib/network/connectivity.ts");
const {
  useMatchScheduleStore: store,
} = require("../lib/storage/matchScheduleStore.ts");
const schedule = (key) => ({
  tournamentKey: key,
  matches: [
    {
      matchNumber: 123,
      matchType: 0,
      teams: [{ number: 8033, alliance: "blue" }],
    },
  ],
});
beforeEach(() => {
  store.getState().clear();
  calls = 0;
  tournament.setState({ value: { key: "2023a" } });
  scouter.setState({ value: { uuid: "one" } });
  connectivity.setState({ status: "online" });
  request = async (key) => schedule(key);
});
test("cached schedules survive offline refresh and failed HTTP refresh", async () => {
  await store.getState().fetchData();
  connectivity.setState({ status: "offline" });
  await store.getState().fetchData();
  assert.equal(calls, 1);
  assert.deepEqual(store.getState().data, schedule("2023a"));
  assert.ok(Object.keys(persisted.state.schedules).length);
  assert.equal("data" in persisted.state, false);
  assert.equal(JSON.stringify(persisted).includes("private"), false);
  connectivity.setState({ status: "online" });
  request = async () => {
    throw new Error("HTTP 500");
  };
  await assert.rejects(store.getState().fetchData());
  assert.deepEqual(store.getState().data, schedule("2023a"));
});
test("switches tournament caches and never borrows another scouter's schedule", async () => {
  await store.getState().fetchData();
  tournament.setState({ value: { key: "2023b" } });
  await store.getState().fetchData();
  tournament.setState({ value: { key: "2023a" } });
  store.getState().selectCurrentSchedule();
  assert.equal(store.getState().data.tournamentKey, "2023a");
  scouter.setState({ value: { uuid: "two" } });
  store.getState().selectCurrentSchedule();
  assert.equal(store.getState().data, null);
});
test("late responses are cached under the original context and reset invalidates in-flight work", async () => {
  let resolve;
  request = () =>
    new Promise((r) => {
      resolve = r;
    });
  const first = store.getState().fetchData();
  const duplicate = store.getState().fetchData();
  assert.equal(calls, 1);
  tournament.setState({ value: { key: "2023b" } });
  store.getState().selectCurrentSchedule();
  resolve(schedule("2023a"));
  await Promise.all([first, duplicate]);
  assert.equal(store.getState().data, null);
  tournament.setState({ value: { key: "2023a" } });
  store.getState().selectCurrentSchedule();
  assert.deepEqual(store.getState().data, schedule("2023a"));
  const last = store.getState().fetchData();
  store.getState().clear();
  resolve(schedule("2023a"));
  await last;
  assert.deepEqual(store.getState().schedules, {});
});
