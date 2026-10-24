/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Isolate the native NetInfo event source. */
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
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
let listener;
let removed = false;
require.cache[require.resolve("@react-native-community/netinfo")] = {
  exports: {
    addEventListener: (fn) => {
      listener = fn;
      return () => {
        removed = true;
      };
    },
  },
};
const {
  connectionStatus,
  monitorConnectivity,
  useConnectivityStore,
} = require("../lib/network/connectivity.ts");
test("distinguishes internet loss from unknown reachability and refreshes when connectivity returns", () => {
  assert.equal(
    connectionStatus({ isConnected: true, isInternetReachable: false }),
    "offline",
  );
  assert.equal(
    connectionStatus({ isConnected: false, isInternetReachable: null }),
    "offline",
  );
  assert.equal(
    connectionStatus({ isConnected: true, isInternetReachable: null }),
    "unknown",
  );
  let refreshes = 0;
  const stop = monitorConnectivity(() => refreshes++);
  listener({ isConnected: true, isInternetReachable: true });
  listener({ isConnected: true, isInternetReachable: true });
  assert.equal(refreshes, 1);
  listener({ isConnected: false, isInternetReachable: false });
  assert.equal(useConnectivityStore.getState().status, "offline");
  listener({ isConnected: true, isInternetReachable: true });
  assert.equal(refreshes, 2);
  stop();
  assert.equal(removed, true);
});
