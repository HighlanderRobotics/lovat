import { describe, expect, it } from "vitest";

import {
  buildFileIndex,
  parsePatchLineMap,
  planBatches,
  selectReviewableFiles,
  splitPatch,
} from "../src/diff.js";
import { file } from "./helpers.js";

describe("parsePatchLineMap", () => {
  it("tracks new-file lines for additions and old-file lines for removals", () => {
    const patch = [
      "@@ -1,3 +1,4 @@",
      " line1",
      "-old",
      "+new",
      "+added",
      " line3",
    ].join("\n");

    const map = parsePatchLineMap(patch);
    expect([...map.added]).toEqual([2, 3]);
    expect([...map.removed]).toEqual([2]);
  });

  it("handles new and deleted files", () => {
    const created = parsePatchLineMap("@@ -0,0 +1,2 @@\n+one\n+two");
    expect([...created.added]).toEqual([1, 2]);
    expect([...created.removed]).toEqual([]);

    const deleted = parsePatchLineMap("@@ -1,2 +0,0 @@\n-one\n-two");
    expect([...deleted.added]).toEqual([]);
    expect([...deleted.removed]).toEqual([1, 2]);
  });

  it("does not consume a line for the no-newline marker", () => {
    const patch = [
      "@@ -1,1 +1,2 @@",
      " context",
      "+added",
      "\\ No newline at end of file",
    ].join("\n");

    const map = parsePatchLineMap(patch);
    expect([...map.added]).toEqual([2]);
    expect([...map.removed]).toEqual([]);
  });

  it("ignores file headers before the first hunk", () => {
    const patch = [
      "diff --git a/src/x.ts b/src/x.ts",
      "index 123..456 100644",
      "--- a/src/x.ts",
      "+++ b/src/x.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");

    const map = parsePatchLineMap(patch);
    expect([...map.added]).toEqual([1]);
    expect([...map.removed]).toEqual([1]);
  });
});

describe("selectReviewableFiles", () => {
  it("separates excluded files and files GitHub returned without a patch", () => {
    const selection = selectReviewableFiles(
      [
        file("src/a.ts"),
        file("apps/server/package-lock.json"),
        file("assets/logo.png", null),
        file("src/binary.bin", ""),
      ],
      ["**/package-lock.json"],
    );

    expect(selection.reviewable.map((entry) => entry.path)).toEqual([
      "src/a.ts",
    ]);
    expect(selection.excluded).toEqual(["apps/server/package-lock.json"]);
    expect(selection.missingPatch).toEqual([
      "assets/logo.png",
      "src/binary.bin",
    ]);
  });

  it("excludes renamed files when their previous path is excluded", () => {
    const selection = selectReviewableFiles(
      [
        file("src/new-name.ts", "@@ -1 +1 @@\n-old\n+new", {
          status: "renamed",
          previousPath: "dist/generated.ts",
        }),
      ],
      ["dist/**"],
    );

    expect(selection.reviewable).toHaveLength(0);
    expect(selection.excluded).toEqual(["src/new-name.ts"]);
  });
});

describe("splitPatch", () => {
  it("returns the original patch when it fits", () => {
    const patch = file("src/a.ts").patch!;
    expect(splitPatch(patch, 10_000)).toEqual([patch]);
  });

  it("splits large patches at hunk boundaries without losing changed lines", () => {
    const hunks = Array.from({ length: 5 }, (_, index) => {
      const start = index * 20 + 1;
      return [
        `@@ -${start},3 +${start},4 @@`,
        ` context-${index}`,
        `-removed-${index}`,
        `+added-${index}`,
        `+added-extra-${index}`,
        ` context-end-${index}`,
      ].join("\n");
    });
    const patch = [
      "diff --git a/src/big.ts b/src/big.ts",
      "--- a/src/big.ts",
      "+++ b/src/big.ts",
      ...hunks,
    ].join("\n");

    const chunks = splitPatch(patch, 400);
    expect(chunks.length).toBeGreaterThan(1);

    const combined = chunks.join("\n");
    for (let index = 0; index < hunks.length; index += 1) {
      expect(combined).toContain(`+added-${index}`);
      expect(combined).toContain(`-removed-${index}`);
    }
  });

  it("keeps a single oversized line rather than dropping it", () => {
    const patch = `@@ -1 +1 @@\n+${"x".repeat(1_500)}`;
    const chunks = splitPatch(patch, 1_000);
    expect(chunks.join("\n")).toContain("x".repeat(1_500));
  });
});

describe("planBatches", () => {
  it("packs small files into one batch", () => {
    const batches = planBatches(
      [file("src/a.ts"), file("src/b.ts")],
      80_000,
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]!.segments.map((segment) => segment.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  it("splits large pull requests into multiple batches without dropping files", () => {
    const files = Array.from({ length: 6 }, (_, index) =>
      file(`src/file-${index}.ts`, [
        "@@ -1,2 +1,3 @@",
        " context",
        `+value-${index}-${"x".repeat(500)}`,
        " context",
      ].join("\n")),
    );

    const batches = planBatches(files, 1_200);
    const paths = batches.flatMap((batch) =>
      batch.segments.map((segment) => segment.path),
    );

    expect(batches.length).toBeGreaterThan(1);
    expect(new Set(paths)).toEqual(new Set(files.map((entry) => entry.path)));
    for (const batch of batches) {
      expect(batch.characters).toBeLessThanOrEqual(1_200 + 200);
    }
  });

  it("advertises only the changed lines present in each segment", () => {
    const patch = [
      "@@ -1,2 +1,3 @@",
      " context",
      "+one",
      "@@ -100,2 +101,3 @@",
      " context",
      "+two",
    ].join("\n");

    const batches = planBatches([file("src/a.ts", patch)], 1_000);
    const map = batches[0]!.segments[0]!.map;
    expect([...map.added]).toEqual([2, 102]);
  });
});

describe("buildFileIndex", () => {
  it("maps files to their changed lines and rename source", () => {
    const index = buildFileIndex([
      file("src/new.ts", "@@ -1 +1 @@\n-old\n+new", {
        previousPath: "src/old.ts",
      }),
    ]);

    expect(index.get("src/new.ts")?.previousPath).toBe("src/old.ts");
    expect([...index.get("src/new.ts")!.map.added]).toEqual([1]);
  });
});
