import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runDeploymentSmoke } from "./deployment-smoke.mjs";

const expected = new Map([
  [
    "https://lovat.app/",
    () => html("<title>Lovat — Centralize your team's strategy in minutes</title>"),
  ],
  [
    "https://learn.lovat.app/",
    () => new Response(null, { status: 307, headers: { location: "/guides/welcome/" } }),
  ],
  ["https://learn.lovat.app/guides/welcome/", () => html("<title>Welcome | Lovat</title>")],
  ["https://dashboard.lovat.app/", () => html("<title>Lovat</title>")],
  [
    "https://dashboard.lovat.app/main.dart.js",
    () => new Response("compiled code", { headers: { "content-type": "application/javascript; charset=UTF-8" } }),
  ],
  ["https://api.lovat.app/status", () => new Response("Server running")],
  ["https://api.lovat.app/version", () => Response.json({ version: "26.0.0", gitCommit: "no commit id" })],
]);
const html = (body) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const testFetch = (url) => expected.get(url)();
const noWait = async () => {};

test("fixed production probes use anonymous GET and no automatic redirects", async () => {
  const calls = [];
  const results = await runDeploymentSmoke({
    fetcher: (url, opts) => {
      calls.push([url, opts]);
      return testFetch(url);
    },
  });

  assert.deepEqual(calls.map(([url]) => url), [...expected.keys()]);
  for (const [, opts] of calls) {
    assert.equal(opts.method, "GET");
    assert.equal(opts.credentials, "omit");
    assert.equal(opts.redirect, "manual");
    assert.ok(opts.signal instanceof AbortSignal);
    assert.equal(opts.headers, undefined);
    assert.equal(opts.body, undefined);
  }
  assert.equal(results.length, expected.size);
  assert.ok(results.every((result) => result.ok && result.attempts === 1));
});

test("Learn accepts the two configured redirect statuses but rejects unrelated destinations", async () => {
  async function check(location, status) {
    const results = await runDeploymentSmoke({
      fetcher: (url) =>
        url === "https://learn.lovat.app/"
          ? new Response(null, { status, headers: { location } })
          : testFetch(url),
    });
    return results.find((entry) => entry.name === "Learn root redirect");
  }

  assert.ok((await check("https://learn.lovat.app/guides/welcome/", 302)).ok);
  for (const [location, status] of [
    ["//external.invalid/guides/welcome/", 307],
    ["/guides/welcome/?unexpected=1", 307],
    ["/guides/welcome/", 301],
  ]) {
    const result = await check(location, status);
    assert.equal(result.reason, "unexpected redirect");
    assert.equal(result.attempts, 1);
    assert.ok(!("location" in result));
  }
});

test("a transient response retries once; deterministic contract failures do not", async () => {
  let calls = 0;
  let waits = 0;
  const results = await runDeploymentSmoke({
    fetcher: (url) => {
      if (url === "https://api.lovat.app/status" && ++calls === 1) {
        return new Response("not ready", { status: 503 });
      }
      if (url === "https://api.lovat.app/version") {
        return Response.json({ error: "unrelated response text" });
      }
      return testFetch(url);
    },
    pause: () => { waits++; },
  });
  const status = results.find((r) => r.name === "API process status");
  const version = results.find((r) => r.name === "API version contract");
  assert.equal(waits, 1);
  assert.equal(status.ok, true);
  assert.equal(status.attempts, 2);
  assert.equal(status.firstAttempt.status, 503);
  assert.equal(version.reason, "unexpected response content");
  assert.equal(version.attempts, 1);
  assert.doesNotMatch(JSON.stringify(results), /unrelated response text/);
});

test("timeout and retry exhaustion are bounded and do not log raw errors", async () => {
  let calls = 0;
  const results = await runDeploymentSmoke({
    fetcher: (url) => {
      if (url === "https://lovat.app/") {
        calls++;
        throw new Error("unsafe arbitrary upstream text");
      }
      return testFetch(url);
    },
    pause: noWait,
    makeDeadline: () => AbortSignal.abort(),
  });
  const result = results.find((r) => r.name === "Website home");
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.equal(result.reason, "request timed out");
  assert.equal(result.attempts, 2);
  assert.doesNotMatch(JSON.stringify(results), /unsafe arbitrary upstream text/);
});

test("wrong content types and over-budget bodies fail without dumping content", async () => {
  const oversized = "x".repeat(36 * 1024);
  const results = await runDeploymentSmoke({
    fetcher: (url) => {
      if (url.endsWith("main.dart.js")) return html("not JavaScript");
      if (url.endsWith("/status")) return new Response("Server running" + oversized);
      if (url === "https://lovat.app/") return html(oversized + "<title>Lovat — Centralize your team</title>");
      return testFetch(url);
    },
  });
  assert.deepEqual(results.filter((r) => !r.ok).map((r) => r.reason), [
    "unexpected response content",
    "unexpected content type",
    "unexpected response content",
  ]);
});

test("CLI rejects target arguments without making requests", () => {
  const path = fileURLToPath(new URL("./deployment-smoke.mjs", import.meta.url));
  const run = spawnSync(process.execPath, [path, "https://external.invalid"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /no arguments/);
});
