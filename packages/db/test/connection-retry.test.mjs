import assert from "node:assert/strict";
import test from "node:test";
import { acquireConnection } from "../dist/connection-retry.js";

test("retries transient cold connection failures before returning a client", async () => {
  let attempts = 0;
  const delays = [];
  const client = {};
  const result = await acquireConnection(
    async () => {
      if (++attempts < 3)
        throw Object.assign(new Error("starting"), {
          code: attempts === 1 ? "ETIMEDOUT" : "57P03",
        });
      return client;
    },
    async (ms) => {
      delays.push(ms);
    },
  );
  assert.equal(result, client);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [250, 750]);
});

test("authentication and statement-like errors fail without retry", async () => {
  for (const code of ["28P01", "23505", "40001", undefined]) {
    let attempts = 0;
    const error = Object.assign(new Error("failure"), { code });
    await assert.rejects(
      acquireConnection(
        async () => {
          attempts++;
          throw error;
        },
        async () => {},
      ),
      (actual) => actual === error,
    );
    assert.equal(attempts, 1);
  }
});

test("connection retries are bounded and preserve the final failure", async () => {
  let attempts = 0;
  const error = Object.assign(new Error("offline"), { code: "ECONNREFUSED" });
  await assert.rejects(
    acquireConnection(
      async () => {
        attempts++;
        throw error;
      },
      async () => {},
    ),
    (actual) => actual === error,
  );
  assert.equal(attempts, 3);
});

test("recovers pg-pool's code-less startup timeouts and nested DNS errors", async () => {
  for (const error of [
    new Error("Connection terminated due to connection timeout", {
      cause: new Error("Connection terminated unexpectedly"),
    }),
    new Error("timeout exceeded when trying to connect"),
    new Error("connect failed", {
      cause: Object.assign(new Error("lookup"), { code: "ETIMEDOUT" }),
    }),
  ]) {
    let attempts = 0;
    assert.equal(
      await acquireConnection(
        async () => {
          if (++attempts === 1) throw error;
          return "connected";
        },
        async () => {},
      ),
      "connected",
    );
    assert.equal(attempts, 2);
  }
});
