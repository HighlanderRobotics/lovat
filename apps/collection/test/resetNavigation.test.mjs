import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { resetToStart } from "../lib/collection/resetNavigation.ts";
const require = createRequire(import.meta.url);
const expoRouter = dirname(require.resolve("expo-router/package.json"));
const { StackRouter } = require(
  join(expoRouter, "build/react-navigation/routers/StackRouter.js"),
);

for (const history of [
  [
    "onboarding/index",
    "onboarding/team-code",
    "onboarding/name",
    "onboarding/tournaments",
  ],
  ["home", "settings/index", "settings/reset"],
  ["game/submit"],
]) {
  test(`reset removes earlier screens from ${history.at(-1)}`, () => {
    const routeNames = [...new Set(["index", ...history])];
    const router = StackRouter({ initialRouteName: "index" });
    let state = {
      stale: false,
      type: "stack",
      key: "test-stack",
      routeKeySeq: history.length,
      index: history.length - 1,
      routeNames,
      routes: history.map((name, i) => ({ name, key: `route-${i}` })),
    };
    resetToStart({
      getState: () => state,
      dispatch: (action) => {
        state = router.getStateForAction(state, action, {
          routeNames,
          routeParamList: {},
          routeGetIdList: {},
        }).state;
      },
    });
    assert.deepEqual(
      state.routes.map((route) => route.name),
      ["index"],
    );
    assert.equal(state.index, 0);
    const back = router.getStateForAction(
      state,
      { type: "GO_BACK" },
      { routeNames, routeParamList: {}, routeGetIdList: {} },
    );
    assert.equal(back, "UNHANDLED");
  });
}
