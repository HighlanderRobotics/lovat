/* global require, __dirname, Response */
/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real cache with isolated native and HTTP dependencies. */
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
const team = create(() => ({ number: 8033, code: "own-code" }));
const api = create(() => ({ getUrlPrefix: () => "https://example.test" }));
const connectivity = create(() => ({ status: "online" }));
let request;
mock("../lib/storage/userStores.ts", { useTeamStore: team });
mock("../lib/network/connectivity.ts", { useConnectivityStore: connectivity });
mock("../lib/storage/zustandStorage.ts", {
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
mock("../lib/lovatAPI/lovatAPI.ts", {
  useUrlPrefix: api,
  get: (url) => request(url),
});
const {
  useCustomPostMatchStore: store,
} = require("../lib/storage/customPostMatchStore.ts");
const data = (number = 8033, questions = ["Old question"]) =>
  Response.json({ teamNumber: number, customPostMatch: questions });
beforeEach(() => {
  store.getState().clear();
  team.setState({ number: 8033, code: "own-code" });
  api.setState({ getUrlPrefix: () => "https://example.test" });
  connectivity.setState({ status: "online" });
  request = async (url) => {
    assert.equal(url, "/v1/manager/custom-post-match");
    return data();
  };
});
test("questions survive offline and failed refresh; an empty server list removes them", async () => {
  await store.getState().fetchData();
  assert.deepEqual(store.getState().getQuestions(), ["Old question"]);
  request = async () => {
    throw Error("network down");
  };
  connectivity.setState({ status: "offline" });
  await store.getState().fetchData();
  assert.deepEqual(store.getState().getQuestions(), ["Old question"]);
  connectivity.setState({ status: "online" });
  await assert.rejects(store.getState().fetchData(), /network down/);
  assert.deepEqual(store.getState().getQuestions(), ["Old question"]);
  request = async () => data(8033, []);
  await store.getState().fetchData();
  assert.deepEqual(store.getState().getQuestions(), []);
});
test("cache is isolated by team and API and rejects an unexpected team", async () => {
  await store.getState().fetchData();
  team.setState({ number: 254, code: "other-code" });
  assert.deepEqual(store.getState().getQuestions(), []);
  await assert.rejects(store.getState().fetchData(), /Unexpected team/);
  request = async () => data(254, ["Other team question"]);
  await store.getState().fetchData();
  assert.deepEqual(store.getState().getQuestions(), ["Other team question"]);
  api.setState({ getUrlPrefix: () => "https://other.test" });
  assert.deepEqual(store.getState().getQuestions(), []);
  api.setState({ getUrlPrefix: () => "https://example.test" });
  team.setState({ number: 8033, code: "own-code" });
  assert.deepEqual(store.getState().getQuestions(), ["Old question"]);
});
test("late responses after context changes or reset never repopulate the active cache", async () => {
  let resolve;
  request = () =>
    new Promise((r) => {
      resolve = r;
    });
  const first = store.getState().fetchData();
  team.setState({ number: 254, code: "other" });
  resolve(data());
  await first;
  assert.deepEqual(store.getState().cache, {});
  team.setState({ number: 8033, code: "own-code" });
  const second = store.getState().fetchData();
  store.getState().clear();
  resolve(data());
  await second;
  assert.deepEqual(store.getState().cache, {});
});
test("malformed or over-limit responses cannot replace a valid cache", async () => {
  await store.getState().fetchData();
  for (const questions of [["1", "2", "3", "4"], ["Same", "Same"], [""]]) {
    request = async () => data(8033, questions);
    await assert.rejects(store.getState().fetchData());
    assert.deepEqual(store.getState().getQuestions(), ["Old question"]);
  }
});
