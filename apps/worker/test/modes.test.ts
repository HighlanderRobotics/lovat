import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

for (const mode of ["batch", "scheduled"]) {
  test(
    mode + " rejects continuous API effects before connecting to a database",
    async () => {
      const child = Bun.spawn([process.execPath, "index.ts"], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: {
          ...process.env,
          WORKER_MODE: mode,
          API_EFFECTS_ENABLED: "true",
          DATABASE_URL: "postgresql://nobody@127.0.0.1:1/lovat_test",
          TBA_KEY: "synthetic-mode-test",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const error = await new Response(child.stderr).text();
      expect(await child.exited).not.toBe(0);
      expect(error).toContain(
        "API_EFFECTS_ENABLED requires WORKER_MODE=continuous",
      );
      expect(error).not.toContain("Can't reach database");
    },
  );
}
