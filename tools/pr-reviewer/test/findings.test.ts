import { describe, expect, it } from "vitest";

import {
  fingerprintFinding,
  isSeverity,
  normalizeFilePath,
  normalizeTitle,
  prepareFindings,
  type FindingPreparationContext,
} from "../src/findings.js";
import { buildFileIndex } from "../src/diff.js";
import type { ModelFinding } from "../src/types.js";
import { file, rawFinding, samplePatch } from "./helpers.js";

function finding(overrides: Partial<ModelFinding> = {}): ModelFinding {
  return {
    severity: "HIGH",
    category: "BUG",
    title: "Missing null check",
    description:
      "The report can be null when the id is unknown, and the response is serialized without checking.",
    suggestion: "Return a 404 when the report is missing.",
    file: "src/report.ts",
    line: 12,
    confidence: 0.9,
    ...overrides,
  };
}

function context(
  files = [file("src/report.ts", samplePatch)],
): FindingPreparationContext {
  return {
    repoFullName: "HighlanderRobotics/lovat",
    pullNumber: 42,
    files,
    categories: ["BUG", "SECURITY", "PERFORMANCE", "DATABASE", "TYPE_SAFETY", "ARCHITECTURE"],
    minimumConfidence: 0.75,
    maxFindings: 20,
  };
}

describe("fingerprintFinding", () => {
  it("is stable across case, whitespace, and punctuation", () => {
    const left = fingerprintFinding({
      repoFullName: "HighlanderRobotics/lovat",
      pullNumber: 42,
      file: "src/report.ts",
      category: "BUG",
      title: "Missing   null-check!",
    });
    const right = fingerprintFinding({
      repoFullName: "highlanderrobotics/LOVAT",
      pullNumber: 42,
      file: "src/report.ts",
      category: "BUG",
      title: "missing null check",
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{16}$/);
  });

  it("changes when the file, category, or pull request changes", () => {
    const base = {
      repoFullName: "HighlanderRobotics/lovat",
      pullNumber: 42,
      file: "src/report.ts",
      category: "BUG" as const,
      title: "Missing null check",
    };

    expect(fingerprintFinding({ ...base, file: "src/other.ts" })).not.toBe(
      fingerprintFinding(base),
    );
    expect(
      fingerprintFinding({ ...base, category: "SECURITY" }),
    ).not.toBe(fingerprintFinding(base));
    expect(fingerprintFinding({ ...base, pullNumber: 43 })).not.toBe(
      fingerprintFinding(base),
    );
  });

  it("normalizes titles and recognizes severities", () => {
    expect(normalizeTitle("  Missing\nNull   Check  ")).toBe("missing null check");
    expect(isSeverity("CRITICAL")).toBe(true);
    expect(isSeverity("critical")).toBe(false);
  });
});

describe("normalizeFilePath", () => {
  const index = buildFileIndex([
    file("src/report.ts", samplePatch, {
      status: "renamed",
      previousPath: "src/old-report.ts",
    }),
    file("src/unique.ts"),
  ]);

  it("accepts repository paths, diff prefixes, and unique basenames", () => {
    expect(normalizeFilePath("src/report.ts", index)).toBe("src/report.ts");
    expect(normalizeFilePath("b/src/report.ts", index)).toBe("src/report.ts");
    expect(normalizeFilePath("./src/report.ts", index)).toBe("src/report.ts");
    expect(normalizeFilePath("report.ts", index)).toBe("src/report.ts");
  });

  it("maps a renamed file's previous path to the current path", () => {
    expect(normalizeFilePath("src/old-report.ts", index)).toBe("src/report.ts");
  });

  it("returns null for unknown files", () => {
    expect(normalizeFilePath("src/missing.ts", index)).toBeNull();
  });
});

describe("prepareFindings", () => {
  it("maps added lines to the right side and unknown lines to the summary", () => {
    const prepared = prepareFindings(
      [finding({ line: 12 }), finding({ title: "Context only", line: 99 })],
      context(),
    );

    expect(prepared.findings).toHaveLength(2);
    expect(prepared.findings[0]!.position).toEqual({ side: "RIGHT", line: 12 });
    expect(prepared.findings[1]!.position).toBeNull();
  });

  it("maps removed lines to the left side", () => {
    const patch = [
      "@@ -5,2 +5,1 @@",
      "-old-a",
      "-old-b",
      "+new",
    ].join("\n");

    const prepared = prepareFindings(
      [finding({ file: "src/removed.ts", line: 6 })],
      context([file("src/removed.ts", patch)]),
    );

    expect(prepared.findings[0]!.position).toEqual({ side: "LEFT", line: 6 });
  });

  it("filters by confidence, category, and unknown files", () => {
    const prepared = prepareFindings(
      [
        finding({ title: "Low confidence", confidence: 0.4 }),
        finding({ title: "Wrong category", category: "ARCHITECTURE" }),
        finding({ title: "Unknown file", file: "src/not-changed.ts" }),
      ],
      { ...context(), categories: ["BUG"] },
    );

    expect(prepared.findings).toHaveLength(0);
    expect(prepared.stats.filteredByConfidence).toBe(1);
    expect(prepared.stats.filteredByCategory).toBe(1);
    expect(prepared.stats.unknownFile).toBe(1);
  });

  it("deduplicates the same finding and keeps the higher confidence", () => {
    const prepared = prepareFindings(
      [
        finding({ confidence: 0.8, description: "first" }),
        finding({ confidence: 0.95, description: "second" }),
      ],
      context(),
    );

    expect(prepared.findings).toHaveLength(1);
    expect(prepared.findings[0]!.confidence).toBe(0.95);
    expect(prepared.findings[0]!.description).toBe("second");
    expect(prepared.stats.duplicated).toBe(1);
  });

  it("sorts by severity then confidence and applies the finding cap", () => {
    const prepared = prepareFindings(
      [
        finding({ title: "Low", severity: "LOW", line: 12 }),
        finding({ title: "Critical", severity: "CRITICAL", line: 13 }),
        finding({ title: "Medium", severity: "MEDIUM", line: 12, confidence: 0.8 }),
      ],
      { ...context(), maxFindings: 2 },
    );

    expect(prepared.findings.map((entry) => entry.title)).toEqual([
      "Critical",
      "Medium",
    ]);
    expect(prepared.stats.capped).toBe(1);
  });

  it("redacts credentials from published text", () => {
    const prepared = prepareFindings(
      [
        finding({
          description:
            "The diff commits sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789 and exposes it.",
        }),
      ],
      context(),
    );

    expect(prepared.findings[0]!.description).not.toContain("sk-or-v1-");
    expect(prepared.findings[0]!.description).toContain("[REDACTED_OPENROUTER_KEY]");
  });

  it("uses the computed fingerprint as the finding id", () => {
    const prepared = prepareFindings([finding()], context());
    expect(prepared.findings[0]!.id).toBe(prepared.findings[0]!.fingerprint);
    expect(prepared.findings[0]!.id).toMatch(/^[a-f0-9]{16}$/);
  });

  it("accepts findings parsed from the model response shape", () => {
    const prepared = prepareFindings(
      [rawFinding({ line: 13 }) as unknown as ModelFinding],
      context(),
    );
    expect(prepared.findings).toHaveLength(1);
  });
});
