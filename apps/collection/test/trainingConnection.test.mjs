import { setImmediate } from "node:timers";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectTrainingDevice,
  trainingTimelinePlan,
} from "../lib/training/deviceConnection.ts";
const settle = () => new Promise((resolve) => setImmediate(resolve));
const snapshot = (status = "LOBBY", overrides = {}) => ({
  uuid: "session",
  status,
  serverTime: 1000,
  startedAt: null,
  video: { durationSeconds: 163 },
  participants: [{ uuid: "attempt" }],
  ...overrides,
});
function fixture() {
  let time = 1000,
    read = async () => snapshot();
  const sockets = [],
    timers = [],
    retries = [],
    received = [],
    connected = [],
    errors = [];
  const stop = connectTrainingDevice({
    credentials: {
      sessionUuid: "session",
      attemptUuid: "attempt",
      token: "secret",
    },
    socketUrl: "wss://api.example/socket",
    fetchSnapshot: () => read(),
    onSnapshot: (s) => received.push(s),
    onConnected: (s) => connected.push(s),
    onError: (s) => errors.push(s),
    now: () => time,
    createSocket: (url) => {
      const socket = {
        url,
        sent: [],
        send(value) {
          this.sent.push(value);
        },
        close() {
          this.closed = true;
        },
      };
      sockets.push(socket);
      return socket;
    },
    repeat: (fn) => {
      const t = { fn };
      timers.push(t);
      return () => (t.stopped = true);
    },
    later: (fn) => {
      const t = { fn };
      retries.push(t);
      return () => (t.stopped = true);
    },
  });
  return {
    stop,
    sockets,
    timers,
    retries,
    received,
    connected,
    errors,
    setRead: (fn) => (read = fn),
    setTime: (n) => (time = n),
  };
}
for (const phase of ["LOBBY", "ARMED", "PLAYING", "ENDED", "INTERRUPTED"]) {
  for (const transport of ["close", "error"])
    test(`device recovers ${transport} in ${phase} without changing attempt`, async () => {
      const f = fixture();
      try {
        await settle();
        const s = snapshot(phase, {
          serverTime: 2000,
          startedAt: ["PLAYING", "ENDED"].includes(phase) ? 1000 : null,
        });
        f.setRead(async () => s);
        f.sockets[0].onmessage({ data: JSON.stringify(s) });
        if (transport === "close") f.sockets[0].onclose({ code: 1006 });
        else f.sockets[0].onerror();
        await settle();
        assert.equal(f.received.at(-1).status, phase);
        assert.equal(f.connected.at(-1), true);
        f.retries.at(-1).fn();
        f.sockets[1].onopen();
        assert.deepEqual(JSON.parse(f.sockets[1].sent[0]), {
          sessionUuid: "session",
          attemptUuid: "attempt",
          token: "secret",
        });
        assert(!f.sockets[1].url.includes("secret"));
      } finally {
        f.stop();
      }
    });
}
test("HTTP works before socket authentication, and silence restores polling", async () => {
  const f = fixture();
  try {
    await settle();
    assert.equal(f.connected.at(-1), true);
    f.sockets[0].onmessage({ data: JSON.stringify(snapshot()) });
    let calls = 0;
    f.setRead(async () => {
      calls++;
      return snapshot("ARMED", { serverTime: 6000 });
    });
    f.timers[0].fn();
    await settle();
    assert.equal(calls, 0);
    f.setTime(6000);
    f.timers[0].fn();
    await settle();
    assert.equal(calls, 1);
    assert.equal(f.received.at(-1).status, "ARMED");
  } finally {
    f.stop();
  }
});
test("bad frames and old or unrelated snapshots cannot replace current attempt", async () => {
  const f = fixture();
  try {
    await settle();
    f.sockets[0].onmessage({
      data: JSON.stringify(
        snapshot("PLAYING", { serverTime: 5000, startedAt: 1000 }),
      ),
    });
    f.setRead(async () =>
      snapshot("PLAYING", { serverTime: 5000, startedAt: 1000 }),
    );
    for (const raw of [
      "{",
      null,
      JSON.stringify(snapshot("ARMED", { serverTime: 6000 })),
      JSON.stringify(
        snapshot("PLAYING", { uuid: "foreign", serverTime: 7000 }),
      ),
      JSON.stringify(
        snapshot("PLAYING", {
          serverTime: 8000,
          participants: [{ uuid: "foreign" }],
        }),
      ),
      JSON.stringify(snapshot("PLAYING", { serverTime: 4000 })),
      JSON.stringify(snapshot("WRONG")),
    ]) {
      f.sockets[0].onmessage({ data: raw });
      await settle();
      assert.equal(f.received.at(-1).status, "PLAYING");
      assert.equal(f.received.at(-1).serverTime, 5000);
    }
  } finally {
    f.stop();
  }
});
for (const status of [401, 403, 404, 410])
  test(`HTTP ${status} stops retries rather than bypassing access`, async () => {
    const f = fixture();
    try {
      await settle();
      f.setTime(7000);
      f.setRead(async () => {
        throw Object.assign(new Error("denied"), { status });
      });
      f.timers[0].fn();
      await settle();
      assert.equal(f.connected.at(-1), false);
      assert.match(f.errors.at(-1), /unavailable/);
      const before = f.sockets.length;
      f.retries.forEach((t) => t.fn());
      assert.equal(f.sockets.length, before);
    } finally {
      f.stop();
    }
  });
test("network failure then recovery preserves state; cleanup ignores pending HTTP", async () => {
  const f = fixture();
  await settle();
  f.setTime(7000);
  f.setRead(async () => {
    throw new Error("offline");
  });
  f.timers[0].fn();
  await settle();
  assert.equal(f.connected.at(-1), false);
  assert.match(f.errors.at(-1), /Reconnecting/);
  assert.equal(f.received.length, 1);
  let resolve;
  f.setRead(() => new Promise((r) => (resolve = r)));
  f.timers[0].fn();
  await settle();
  f.stop();
  resolve(snapshot("PLAYING"));
  await settle();
  assert.equal(f.received.length, 1);
  assert(f.timers[0].stopped);
  assert(f.sockets[0].closed);
});
test("socket access denial is terminal even if a poll finishes afterwards", async () => {
  const f = fixture();
  await settle();
  f.sockets[0].onclose({ code: 1008 });
  f.timers[0].fn();
  await settle();
  assert.equal(f.connected.at(-1), false);
  assert.equal(f.retries.length, 0);
  f.stop();
});
test("terminal snapshots cannot reopen scouting", async () => {
  const f = fixture();
  try {
    await settle();
    for (const status of ["ENDED", "PLAYING", "INTERRUPTED"])
      f.sockets[0].onmessage({
        data: JSON.stringify(snapshot(status, { serverTime: 9000 })),
      });
    assert.equal(f.received.at(-1).status, "ENDED");
  } finally {
    f.stop();
  }
});
test("preview never starts reports; reconnect uses original clock and exact match end", () => {
  for (const phase of ["LOBBY", "ARMED"])
    assert.deepEqual(
      trainingTimelinePlan(snapshot(phase), undefined, false, 5000),
      {},
    );
  assert.deepEqual(
    trainingTimelinePlan(
      snapshot("PLAYING", { startedAt: 1000, serverTime: 26000 }),
      undefined,
      false,
      50000,
    ),
    { startTime: 25000, endTime: undefined, remainingMs: 138000 },
  );
  const s = snapshot("PLAYING", { startedAt: 1000, serverTime: 179000 });
  assert.deepEqual(trainingTimelinePlan(s, 25000, false, 999000), {
    startTime: undefined,
    endTime: 188000,
    remainingMs: 0,
  });
  assert.deepEqual(
    trainingTimelinePlan(
      snapshot("ENDED", { startedAt: 1000, serverTime: 200000 }),
      undefined,
      false,
      300000,
    ),
    { startTime: 101000, endTime: 264000, remainingMs: 0 },
  );
  assert.deepEqual(trainingTimelinePlan(s, 25000, true, 999000), {});
  assert.deepEqual(
    trainingTimelinePlan(snapshot("INTERRUPTED"), undefined, false, 10000),
    { interrupted: true, endTime: undefined },
  );
  assert.equal(
    trainingTimelinePlan(snapshot("INTERRUPTED"), 25000, false, 300000).endTime,
    188000,
  );
});

for (const elapsed of [
  0, 1, 22000, 22999, 23000, 162999, 163000, 177999, 178000,
])
  test(`reconnection at ${elapsed}ms retains the report boundary`, () => {
    const start = 10000,
      s = snapshot("PLAYING", { startedAt: 1000, serverTime: 1000 + elapsed });
    const plan = trainingTimelinePlan(s, start, false, start + elapsed);
    assert.equal(plan.startTime, undefined);
    assert.equal(plan.remainingMs, Math.max(0, 163000 - elapsed));
    assert.equal(plan.endTime, elapsed >= 163000 ? 173000 : undefined);
  });
