import assert from "node:assert/strict";
import test from "node:test";
import { selectJobs, matches } from "./ci-selection.mjs";
test("shared fixtures select every consumer and the real contract journey", () => {
  const jobs = selectJobs(["docs/testing/fixtures/contract-v1.json"]);
  for (const job of [
    "server",
    "collection",
    "dashboard",
    "website",
    "learn",
    "contracts",
  ])
    assert.equal(jobs[job], true, job);
});
test("Server and database changes run consumer contracts while isolated web edits stay isolated", () => {
  for (const path of [
    "apps/server/src/handler/collection/reportSchema.ts",
    "packages/db/prisma/schema.prisma",
  ]) {
    const jobs = selectJobs([path]);
    assert.equal(jobs.server, true);
    assert.equal(jobs.contracts, true);
  }
  const jobs = selectJobs(["apps/website/src/routes/+page.svelte"]);
  assert.equal(jobs.website, true);
  assert.equal(jobs.contracts, false);
  assert.equal(jobs.collection, false);
});
test("workflow and selector changes choose all affected jobs", () => {
  for (const path of [".github/workflows/ci.yml", ".github/ci-filters.json"])
    for (const selected of Object.values(selectJobs([path])))
      assert.equal(selected, true);
  const native = selectJobs([".github/workflows/dashboard-native-tests.yml"]);
  assert.equal(native.dashboard, true);
});
test("double-star rules include direct and nested files without selecting neighboring apps", () => {
  assert.equal(matches("apps/server/**", "apps/server/package.json"), true);
  assert.equal(
    matches(
      "docs/testing/fixtures/**",
      "docs/testing/fixtures/old/payload.json",
    ),
    true,
  );
  assert.equal(
    matches("scripts/ci-results.*", "scripts/ci-results.test.mjs"),
    true,
  );
  assert.equal(matches("apps/server/**", "apps/server-other/src/a.ts"), false);
});

test("literal dots stay literal and unsupported glob syntax fails", () => {
  assert.equal(
    matches("scripts/ci-results.*", "scripts/ci-resultsXtest.mjs"),
    false,
  );
  for (const pattern of ["a/{b,c}", "a/[b]", "a/?", "!a/*"]) {
    assert.throws(() => matches(pattern, "a/b"), /Unsupported/);
  }
});
