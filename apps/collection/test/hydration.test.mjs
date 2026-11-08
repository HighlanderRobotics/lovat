import { URL } from "node:url";
import { setTimeout } from "node:timers";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createStore } from "zustand/vanilla";
import { persist, createJSONStorage } from "zustand/middleware";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const exports = {};
runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/storage/zustandStorage.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  {
    exports,
    Promise,
    require: (name) =>
      name === "@react-native-async-storage/async-storage"
        ? { default: {} }
        : require(name),
  },
);
const { waitForStoreHydration } = exports;

function fixture(getItem) {
  const deleted = [];
  const store = createStore(
    persist(() => ({ value: null }), {
      name: "scouterStore",
      skipHydration: true,
      storage: createJSONStorage(() => ({
        getItem,
        setItem: async () => {},
        removeItem: async (key) => {
          deleted.push(key);
        },
      })),
    }),
  );
  return { store, deleted };
}

for (const [name, read] of [
  ["malformed saved JSON", async () => "{malformed"],
  [
    "an unreadable settings key",
    async () => {
      throw new Error("storage unavailable");
    },
  ],
]) {
  test(`${name} allows startup to use defaults without deleting reports`, async () => {
    const { store, deleted } = fixture(read);
    const result = await Promise.race([
      waitForStoreHydration(store).then(() => "completed"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 100)),
    ]);
    assert.equal(result, "completed");
    assert.equal(store.getState().value, null);
    assert.deepEqual(deleted, []);
  });
}

test("startup waits until saved state has actually loaded", async () => {
  let finish;
  const { store } = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let completed = false;
  const loading = waitForStoreHydration(store).then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  finish(
    JSON.stringify({ state: { value: { uuid: "saved-scout" } }, version: 0 }),
  );
  await loading;
  assert.equal(store.getState().value.uuid, "saved-scout");
});

test("an already hydrated store is not read again", async () => {
  let reads = 0;
  const { store } = fixture(async () => {
    reads++;
    return null;
  });
  await store.persist.rehydrate();
  await waitForStoreHydration(store);
  assert.equal(reads, 1);
});
