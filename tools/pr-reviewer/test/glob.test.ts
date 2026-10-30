import { describe, expect, it } from "vitest";

import { isExcludedPath, matchesGlob } from "../src/glob.js";

describe("matchesGlob", () => {
  it("matches directory trees", () => {
    expect(matchesGlob("node_modules", "node_modules/**")).toBe(true);
    expect(matchesGlob("node_modules/pkg/index.js", "node_modules/**")).toBe(
      true,
    );
    expect(matchesGlob("apps/server/node_modules/pkg/index.js", "**/node_modules/**")).toBe(
      true,
    );
  });

  it("matches basename-only patterns at any depth", () => {
    expect(matchesGlob("package-lock.json", "**/package-lock.json")).toBe(true);
    expect(matchesGlob("apps/server/package-lock.json", "**/package-lock.json")).toBe(
      true,
    );
    expect(matchesGlob("apps/server/cache.lock", "*.lock")).toBe(true);
    expect(matchesGlob("apps/server/cache.lock.bak", "*.lock")).toBe(false);
  });

  it("respects path segment boundaries for a single star", () => {
    expect(matchesGlob("apps/server/dist/index.js", "apps/*/dist/**")).toBe(
      true,
    );
    expect(matchesGlob("apps/server/src/dist/index.js", "apps/*/dist/**")).toBe(
      false,
    );
    expect(matchesGlob("apps/server/dist", "apps/*/dist/**")).toBe(true);
  });

  it("supports question marks and double-star path segments", () => {
    expect(matchesGlob("src/a.ts", "src/?.ts")).toBe(true);
    expect(matchesGlob("src/ab.ts", "src/?.ts")).toBe(false);
    expect(matchesGlob("src/test.ts", "src/**/test.ts")).toBe(true);
    expect(matchesGlob("src/a/b/test.ts", "src/**/test.ts")).toBe(true);
    expect(matchesGlob("src/a/b/other.ts", "src/**/test.ts")).toBe(false);
  });

  it("reports whether any configured path excludes a file", () => {
    expect(
      isExcludedPath("apps/server/package-lock.json", [
        "dist/**",
        "**/package-lock.json",
      ]),
    ).toBe(true);
    expect(isExcludedPath("src/index.ts", ["dist/**"])).toBe(false);
  });
});
