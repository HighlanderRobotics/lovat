import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApi } from "../dist/app.js";
import { HttpError } from "../dist/errors.js";
import { report, scope } from "./fixtures.mjs";

async function fixture(t, overrides = {}) {
  const loads = [];
  const logs = [];
  const api = createApi({
    authenticate: async (header) => {
      if (header !== "Bearer token")
        throw new HttpError(401, "UNAUTHORIZED", "Denied");
      return scope;
    },
    repository: {
      loadReports: async (...args) => {
        loads.push(args);
        return [report()];
      },
    },
    ready: async () => true,
    log: (event) => logs.push(event),
    ...overrides,
  });
  api.server.listen(0, "127.0.0.1");
  await once(api.server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        api.server.close(resolve);
        api.server.closeAllConnections();
      }),
  );
  return {
    ...api,
    loads,
    logs,
    url: "http://127.0.0.1:" + api.server.address().port,
  };
}
const post = (body) => ({
  method: "POST",
  headers: {
    Authorization: "Bearer token",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});
test("analysis loads once for many metrics and forwards mandatory auth scope", async (t) => {
  const api = await fixture(t);
  const response = await fetch(
    api.url + "/v3/analysis",
    post({ teams: [8033], metrics: ["totalPoints", "driverAbility"] }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).teams["8033"].metrics.driverAbility.value,
    3,
  );
  assert.equal(api.loads.length, 1);
  assert.deepEqual(api.loads[0][0], scope);
  assert.equal(api.loads[0][2].has("events"), true);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("validation rejects unknown metrics, source overrides and excessive bodies before loading", async (t) => {
  const api = await fixture(t);
  for (const body of [
    { teams: [8033], metrics: ["unknown"] },
    { teams: [8033], metrics: ["totalPoints"], sources: {} },
  ]) {
    assert.equal(
      (await fetch(api.url + "/v3/analysis", post(body))).status,
      400,
    );
  }
  assert.equal(
    (
      await fetch(
        api.url + "/v3/analysis",
        post({ padding: "x".repeat(70000) }),
      )
    ).status,
    413,
  );
  assert.equal(api.loads.length, 0);
});
test("authentication, origin policy and unexpected failures are sanitized", async (t) => {
  const api = await fixture(t, {
    repository: {
      loadReports: async () => {
        throw new Error("database password");
      },
    },
  });
  assert.equal((await fetch(api.url + "/v3/metrics")).status, 401);
  assert.equal(
    (
      await fetch(api.url + "/v3/metrics", {
        headers: { origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  const response = await fetch(
    api.url + "/v3/analysis",
    post({ teams: [8033], metrics: ["driverAbility"] }),
  );
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes("password"), false);
  assert.equal(
    api.logs.some((log) => JSON.stringify(log).includes("token")),
    false,
  );
});
test("readiness reflects dependencies and draining preserves liveness", async (t) => {
  const api = await fixture(t, { ready: async () => false });
  assert.equal((await fetch(api.url + "/health/ready")).status, 503);
  api.drain();
  assert.equal((await fetch(api.url + "/health/live")).status, 200);
  assert.equal(
    (
      await fetch(api.url + "/v3/metrics", {
        headers: { Authorization: "Bearer token" },
      })
    ).status,
    503,
  );
});

test("internal metric validation failures return sanitized server errors", async (t) => {
  const api = await fixture(t, {
    repository: { loadReports: async () => [report({ driverAbility: NaN })] },
  });
  const response = await fetch(
    api.url + "/v3/analysis",
    post({ teams: [8033], metrics: ["driverAbility"] }),
  );
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, "INTERNAL_SERVER_ERROR");
});
test("concurrency admission stays bounded while a repository call is in flight", async (t) => {
  let release;
  let signalStarted;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  const api = await fixture(t, {
    maxConcurrent: 1,
    repository: {
      loadReports: async () => {
        signalStarted();
        await gate;
        return [report()];
      },
    },
  });
  const first = fetch(
    api.url + "/v3/analysis",
    post({ teams: [8033], metrics: ["driverAbility"] }),
  );
  await started;
  try {
    const overloaded = await fetch(api.url + "/v3/metrics", {
      headers: { Authorization: "Bearer token" },
    });
    assert.equal(overloaded.status, 503);
  } finally {
    release();
    assert.equal((await first).status, 200);
  }
});
