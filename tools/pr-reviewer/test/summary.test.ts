import { describe, expect, it } from "vitest";

import {
  collectPriorFingerprints,
  decodeState,
  encodeState,
  findPreviousState,
  renderCompletedSummary,
  renderFailureSummary,
  renderInlineComment,
  SUMMARY_MARKER,
  type ReviewState,
} from "../src/summary.js";
import type { ReviewCommentInfo, ReviewFinding, ReviewInfo } from "../src/types.js";
import { samplePullRequest } from "./helpers.js";

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: "abcdef0123456789",
    fingerprint: "abcdef0123456789",
    severity: "HIGH",
    category: "BUG",
    title: "Missing null check",
    description: "The report can be null and the handler dereferences it.",
    suggestion: "Return a 404 when the report is missing.",
    file: "src/report.ts",
    line: 12,
    confidence: 0.9,
    position: { side: "RIGHT", line: 12 },
    ...overrides,
  };
}

const state: ReviewState = {
  version: 1,
  fingerprints: ["abcdef0123456789"],
};

describe("review state", () => {
  it("round-trips through a hidden marker", () => {
    const encoded = encodeState(state);
    expect(encoded).toContain("<!-- lovat-review:state ");
    expect(decodeState(`body\n${encoded}`)).toEqual(state);
  });

  it("rejects malformed state markers", () => {
    expect(decodeState("no marker")).toBeNull();
    expect(decodeState("<!-- lovat-review:state not-base64 -->")).toBeNull();
    expect(
      decodeState(
        `<!-- lovat-review:state ${Buffer.from(JSON.stringify({ v: 2 })).toString("base64")} -->`,
      ),
    ).toBeNull();
  });

  it("uses the latest bot review state and ignores human comments", () => {
    const reviews: ReviewInfo[] = [
      {
        id: 1,
        body: `${SUMMARY_MARKER}\n${encodeState({ version: 1, fingerprints: ["1111111111111111"] })}`,
        userType: "Bot",
      },
      {
        id: 2,
        body: `${SUMMARY_MARKER}\n${encodeState({ version: 1, fingerprints: ["2222222222222222"] })}`,
        userType: "Bot",
      },
      {
        id: 3,
        body: `${SUMMARY_MARKER}\n${encodeState({ version: 1, fingerprints: ["3333333333333333"] })}`,
        userType: "User",
      },
    ];

    expect(findPreviousState(reviews)).toEqual({
      version: 1,
      fingerprints: ["2222222222222222"],
    });
  });

  it("falls back to finding markers when no state exists", () => {
    const comments: ReviewCommentInfo[] = [
      {
        id: 1,
        body: "text\n<!-- lovat-review:finding aaaaaaaaaaaaaaaa -->",
        path: "src/a.ts",
        line: 1,
        userType: "Bot",
      },
      {
        id: 2,
        body: "text\n<!-- lovat-review:finding bbbbbbbbbbbbbbbb -->",
        path: "src/a.ts",
        line: 2,
        userType: "User",
      },
    ];

    expect([...collectPriorFingerprints([], comments)]).toEqual([
      "aaaaaaaaaaaaaaaa",
    ]);
  });
});

describe("renderCompletedSummary", () => {
  it("groups findings by severity and describes unpositioned findings fully", () => {
    const body = renderCompletedSummary({
      pullRequest: samplePullRequest,
      model: "test/model",
      assessment: "The change is mostly sound.",
      findings: [
        finding(),
        finding({
          fingerprint: "ffffffffffffffff",
          id: "ffffffffffffffff",
          severity: "CRITICAL",
          title: "Authorization bypass",
          description: "Any authenticated user can read another team's report.",
          suggestion: "Filter the query by the caller's team.",
          file: "src/other.ts",
          line: 44,
          position: null,
        }),
      ],
      previouslyReported: new Set(["abcdef0123456789"]),
      inlineFallback: false,
      details: ["Review batches: 2", "Tokens: 100 prompt + 20 completion"],
      limitations: ["CODE_REVIEW.md was truncated."],
      state,
    });

    expect(body).toContain("## Lovat AI review");
    expect(body).toContain("**Status:** completed");
    expect(body).toContain("**Critical:** 1");
    expect(body).toContain("**High:** 1");
    expect(body).toContain("The change is mostly sound.");
    expect(body).toContain("Authorization bypass");
    expect(body).toContain("Any authenticated user can read another team's report.");
    expect(body).toContain("**Suggestion:** Filter the query by the caller's team.");
    expect(body).toContain("previously reported, not repeated inline");
    expect(body).toContain("Review batches: 2");
    expect(body).toContain("CODE_REVIEW.md was truncated.");
    expect(decodeState(body)).toEqual(state);
  });

  it("omits the compact description for inline findings", () => {
    const body = renderCompletedSummary({
      pullRequest: samplePullRequest,
      model: "test/model",
      assessment: "",
      findings: [finding()],
      previouslyReported: new Set(),
      inlineFallback: false,
      details: [],
      limitations: [],
      state: { version: 1, fingerprints: [] },
    });

    expect(body).toContain("Missing null check");
    expect(body).not.toContain(
      "The report can be null and the handler dereferences it.",
    );
  });

  it("shows full detail for every finding when inline publishing failed", () => {
    const body = renderCompletedSummary({
      pullRequest: samplePullRequest,
      model: "test/model",
      assessment: "",
      findings: [finding()],
      previouslyReported: new Set(),
      inlineFallback: true,
      details: [],
      limitations: [],
      state: { version: 1, fingerprints: ["abcdef0123456789"] },
    });

    expect(body).toContain(
      "The report can be null and the handler dereferences it.",
    );
  });

  it("renders a clean review", () => {
    const body = renderCompletedSummary({
      pullRequest: samplePullRequest,
      model: "test/model",
      assessment: "No problems found.",
      findings: [],
      previouslyReported: new Set(),
      inlineFallback: false,
      details: ["Review batches: 1"],
      limitations: [],
      state: { version: 1, fingerprints: [] },
    });

    expect(body).toContain("No high-confidence issues were found");
    expect(body).toContain("**Findings:** 0");
  });
});

describe("renderInlineComment", () => {
  it("includes severity, category, suggestion, and a fingerprint marker", () => {
    const body = renderInlineComment(finding(), "test/model");
    expect(body).toContain("**`HIGH` · `BUG`**");
    expect(body).toContain("Suggested fix");
    expect(body).toContain("<!-- lovat-review:finding abcdef0123456789 -->");
  });

  it("refuses to render a comment without a position", () => {
    expect(() =>
      renderInlineComment(finding({ position: null }), "test/model"),
    ).toThrow(/without a diff position/);
  });
});

describe("renderFailureSummary", () => {
  it("marks the review failed, preserves state, and redacts errors", () => {
    const body = renderFailureSummary({
      model: "test/model",
      message: "OpenRouter returned 401 for key sk-or-v1-abcdefghijklmnopqrstuvwxyz",
      runUrl: "https://github.com/org/repo/actions/runs/1",
      state,
      knownSecrets: [],
    });

    expect(body).toContain("## Lovat AI review failed");
    expect(body).toContain("This is not a clean review.");
    expect(body).toContain("View the workflow run");
    expect(body).not.toContain("sk-or-v1-");
    expect(decodeState(body)).toEqual(state);
  });
});
