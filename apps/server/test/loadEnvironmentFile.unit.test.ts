import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvironmentFile } from "../src/lib/loadEnvironmentFile.js";

afterEach(() => vi.unstubAllEnvs());
it("loads a reset namespace from a file without overriding deployment configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lovat-reset-"));
  const path = join(directory, ".env");
  vi.stubEnv("REDIS_KEY_PREFIX", undefined);
  try {
    await writeFile(path, "REDIS_KEY_PREFIX=lovat:file-test:\n");
    loadEnvironmentFile(path);
    expect(process.env.REDIS_KEY_PREFIX).toBe("lovat:file-test:");
    vi.stubEnv("REDIS_KEY_PREFIX", "lovat:deployment:");
    loadEnvironmentFile(path);
    expect(process.env.REDIS_KEY_PREFIX).toBe("lovat:deployment:");
    expect(() => loadEnvironmentFile(join(directory, "missing"))).not.toThrow();
  } finally {
    await rm(directory, { recursive: true });
  }
});
