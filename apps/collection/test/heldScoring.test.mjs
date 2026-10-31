import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../lib/collection/ui/actions/FuelActions.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  `${source}\nexport { useDragFunctionsFromScoringMode };`,
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  },
).outputText;

// Run the production hook with deterministic native haptics, timers, and
// synchronous Zustand notifications, without a device or React Native runtime.
function fixture(mode, startType = 0, stopType = 1) {
  let now = 1000;
  const events = [],
    haptics = [],
    displays = [],
    effects = [],
    timers = new Map();
  const listeners = new Set();
  let nextTimer = 0;
  let state = {
    uuid: "training-report",
    meta: { collection: {} },
    addEvent(event) {
      events.push(event);
      update({ ...state });
    },
  };
  function update(next) {
    const previous = state;
    state = next;
    for (const listener of listeners) listener(state, previous);
  }
  const store = () => state;
  store.getState = () => state;
  store.subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const react = {
    useRef: (current) => ({ current }),
    useState: (value) => [value, () => {}],
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name.endsWith("/reportStateStore"))
        return { useReportStateStore: store };
      if (name.endsWith("/userStores"))
        return { ScoringMode: { Rate: 0, Count: 1 } };
      if (name === "expo-haptics")
        return {
          ImpactFeedbackStyle: { Medium: "medium", Soft: "soft" },
          impactAsync: (style) => haptics.push(style),
        };
      return {};
    },
    Date: { now: () => now },
    setInterval(fn) {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearInterval(id) {
      timers.delete(id);
    },
  });
  const handlers = exports.useDragFunctionsFromScoringMode(
    mode,
    startType,
    stopType,
    3,
    (text) => displays.push(text),
  );
  const cleanups = effects.map((fn) => fn());
  return {
    handlers,
    events,
    haptics,
    displays,
    timers,
    advance(ms) {
      now += ms;
      for (const fn of timers.values()) fn();
    },
    end(timestamp) {
      update({ ...state, meta: { collection: { endTime: timestamp } } });
    },
    unmount() {
      for (const cleanup of cleanups) cleanup?.();
    },
  };
}

for (const [label, mode] of [
  ["count", 1],
  ["rate", 0],
]) {
  for (const [action, start, stop] of [
    ["scoring", 0, 1],
    ["feeding", 12, 13],
  ]) {
    test(`training auto-end closes held ${action} in ${label} mode exactly once`, () => {
      const f = fixture(mode, start, stop);
      f.handlers.onStart();
      f.handlers.onStart();
      f.handlers.onMove(200, 0, 200);
      f.advance(500);
      const quantity = Number(f.displays.at(-1));
      f.end(163000);
      assert.equal(f.timers.size, 0);
      assert.equal(f.events.length, 2);
      assert.equal(f.events[0].type, start);
      assert.equal(f.events[1].type, stop);
      assert.equal(f.events[1].timestamp, 163000);
      assert.equal(f.events[1].quantity, quantity);
      const vibrations = f.haptics.length;
      f.advance(10000);
      f.handlers.onMove(400, 0, 400);
      f.handlers.onEnd(400, 0, 400);
      f.handlers.onStart();
      f.end(163000);
      assert.equal(f.events.length, 2);
      assert.equal(f.haptics.length, vibrations);
      f.unmount();
    });
  }
}

test("an already released score does not get a second stop at match end", () => {
  const f = fixture(0);
  f.handlers.onStart();
  f.handlers.onEnd(0, 0, 0, 1200);
  f.end(163000);
  assert.equal(f.events.length, 2);
  assert.equal(f.events[1].timestamp, 1200);
  assert.equal(f.events[1].quantity, 1);
  f.unmount();
});

test("leaving the scoring screen clears its haptic timer and subscription", () => {
  const f = fixture(0);
  f.handlers.onStart();
  f.unmount();
  assert.equal(f.timers.size, 0);
  const vibrations = f.haptics.length;
  f.advance(10000);
  f.end(163000);
  assert.equal(f.haptics.length, vibrations);
  assert.equal(f.events.length, 1);
});
