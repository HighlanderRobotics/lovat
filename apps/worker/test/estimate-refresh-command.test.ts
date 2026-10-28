import { expect, test } from "bun:test";
import { join } from "node:path";
test("estimate backfill refuses an unverified Railway target before database access", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "tools/refresh-event-estimates.ts",
      "2026cacg",
      "1967,8033",
    ],
    {
      cwd: join(import.meta.dir, ".."),
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql://synthetic:never-log-me@production.invalid/private",
        RAILWAY_ENVIRONMENT_ID: "production",
        LOVAT_ESTIMATE_ENVIRONMENT_ID: "preview",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(1);
  expect(out).toBe("");
  expect(err).toContain(
    "Explicit matching target Railway environment required",
  );
  expect(err).not.toContain("never-log-me");
  expect(err).not.toContain("production.invalid");
});
