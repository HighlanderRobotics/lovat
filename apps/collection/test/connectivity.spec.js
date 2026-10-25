/* eslint-disable @typescript-eslint/no-require-imports -- Jest loads these migrated CommonJS regressions and native mocks synchronously. */
const { test } = require("@jest/globals");
const assert = require("node:assert/strict");
let listener;
let removed = false;
jest.doMock("@react-native-community/netinfo", () => ({
  refresh: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
  addEventListener: (fn) => {
    listener = fn;
    return () => {
      removed = true;
    };
  },
}));
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

test("foreground refresh rechecks the native connection", async () => {
  const { refreshConnectivity } = require("../lib/network/connectivity.ts");
  assert.deepEqual(await refreshConnectivity(), {
    isConnected: true,
    isInternetReachable: true,
  });
});
