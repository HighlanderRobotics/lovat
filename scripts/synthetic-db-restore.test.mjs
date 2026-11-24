import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  postgresEnvironment,
  postgresUrl,
  restoreArguments,
  withRehearsalCleanup,
} from "./synthetic-db-restore.mjs";

test("successful rehearsal returns its metrics after cleanup", () => {
  const metrics = { restoreMs: 12 };
  const calls = [];
  const result = withRehearsalCleanup(
    () => {
      calls.push("rehearse");
      return metrics;
    },
    () => calls.push("cleanup"),
  );
  assert.deepEqual(calls, ["rehearse", "cleanup"]);
  assert.equal(result, metrics);
});

for (const primary of [
  new Error("pg_restore failed: bad archive"),
  new Error("Migration history differs"),
]) {
  test(`cleanup runs without masking ${primary.message}`, () => {
    let cleanupRuns = 0;
    assert.throws(
      () =>
        withRehearsalCleanup(
          () => {
            throw primary;
          },
          () => cleanupRuns++,
        ),
      (error) => error === primary,
    );
    assert.equal(cleanupRuns, 1);
  });

  test(`cleanup failure retains its diagnostic and ${primary.message}`, () => {
    const cleanup = new Error(
      "Could not stop disposable PostgreSQL; retained /tmp/lovat-restore-123 for cleanup",
    );
    assert.throws(
      () =>
        withRehearsalCleanup(
          () => {
            throw primary;
          },
          () => {
            throw cleanup;
          },
        ),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [primary, cleanup]);
        // The CLI prints error.message, so both diagnostics belong in it.
        assert.equal(
          error.message,
          `Rehearsal failed: ${primary.message}\nCleanup failed: ${cleanup.message}`,
        );
        return true;
      },
    );
  });
}

test("cleanup-only failure preserves the diagnostic and does not return metrics", () => {
  const cleanup = new Error(
    "Could not remove disposable rehearsal files at /tmp/lovat-restore-123: permission denied",
  );
  assert.throws(
    () =>
      withRehearsalCleanup(
        () => ({ restoreMs: 12 }),
        () => {
          throw cleanup;
        },
      ),
    (error) => error === cleanup,
  );
});

test("rehearsal commands do not inherit database, credential, or dotenv settings", () => {
  assert.deepEqual(postgresEnvironment("/known/tools", "/private/sandbox"), {
    PATH: "/known/tools",
    HOME: "/private/sandbox",
    LANG: "C",
    DOTENV_CONFIG_PATH: "/dev/null",
  });
});

test("restore targets only the disposable database via the private socket", () => {
  assert.deepEqual(
    restoreArguments("/private/socket", "/private/synthetic.dump"),
    [
      "--host",
      "/private/socket",
      "--port",
      "5432",
      "--username",
      "lovat_rehearsal",
      "--dbname",
      "lovat_rehearsal_target",
      "--no-password",
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "/private/synthetic.dump",
    ],
  );
});

test("CLI rejects passed hosts or archives before opening a database", () => {
  const script = fileURLToPath(
    new URL("./synthetic-db-restore.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [script, "postgresql://example.invalid/production"],
    {
      encoding: "utf-8",
      env: { PATH: "/nonexistent" },
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no arguments accepted/);
});

test("Prisma uses the private socket and has no usable TCP fallback", () => {
  const url = new URL(
    postgresUrl("/private/own socket", "lovat_rehearsal_target"),
  );
  assert.equal(url.hostname, "localhost.invalid");
  assert.equal(url.searchParams.get("host"), "/private/own socket");
  assert.equal(url.pathname, "/lovat_rehearsal_target");
  assert.throws(
    () => postgresUrl("/private/socket", "production"),
    /Unexpected database/,
  );
});
