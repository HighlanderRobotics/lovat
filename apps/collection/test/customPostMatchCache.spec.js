/* eslint-disable @typescript-eslint/no-require-imports -- Jest loads these migrated CommonJS regressions and native mocks synchronously. */
const { test, beforeEach } = require("@jest/globals");
const assert = require("node:assert/strict");
const { create } = require("zustand");
const mock = (file, exports) => {
  jest.doMock(file, () => exports);
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

test("custom questions require a team, code and API and never infer absence from a missing cache", async () => {
  for (const number of [null, 8033])
    for (const code of ["", "own-code"])
      for (const url of ["", "https://example.test"]) {
        team.setState({ number, code });
        api.setState({ getUrlPrefix: () => url });
        if (!number || !code || !url) {
          await store.getState().fetchData();
          assert.deepEqual(store.getState().getQuestions(), []);
        }
      }
});

test("concurrent question refreshes share a request and HTTP failures retain cached questions", async () => {
  let finish;
  let requests = 0;
  request = () => {
    requests++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const one = store.getState().fetchData(),
    two = store.getState().fetchData();
  assert.equal(requests, 1);
  finish(data());
  await Promise.all([one, two]);
  assert.deepEqual(store.getState().getQuestions(), ["Old question"]);
  request = async () => new Response("Unavailable", { status: 503 });
  await assert.rejects(store.getState().fetchData(), /Could not load/);
  assert.deepEqual(store.getState().getQuestions(), ["Old question"]);
});
