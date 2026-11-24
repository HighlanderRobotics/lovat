import { findingMarker } from "./findings.js";
import type {
  PullRequestInfo,
  ReviewCommentInfo,
  ReviewFinding,
  ReviewInfo,
  Severity,
  SummaryCommentInfo,
} from "./types.js";
import { SEVERITIES } from "./types.js";
import { redactSecrets } from "./redact.js";

export const SUMMARY_MARKER = "<!-- lovat-review:summary -->";
export const SUMMARY_COMMENT_MARKER = "<!-- lovat-review:persistent-summary -->";
const STATE_PATTERN = /<!-- lovat-review:state ([A-Za-z0-9+/=]+) -->/;
const FINDING_PATTERN = /<!-- lovat-review:finding ([a-f0-9]{16}) -->/g;
const PREVIOUS_RESULT_START = "<!-- lovat-review:previous-result-start -->";
const PREVIOUS_RESULT_END = "<!-- lovat-review:previous-result-end -->";

export interface ReviewState {
  version: 1;
  fingerprints: string[];
  /** Last review represented by this state, for recovery after partial publishing. */
  lastReviewId?: number;
}

export function encodeState(state: ReviewState): string {
  const payload = JSON.stringify({
    v: state.version,
    fingerprints: [...new Set(state.fingerprints)].sort(),
    ...(state.lastReviewId === undefined ? {} : { lastReviewId: state.lastReviewId }),
  });
  return `<!-- lovat-review:state ${Buffer.from(payload, "utf8").toString("base64")} -->`;
}

export function decodeState(body: string): ReviewState | null {
  const match = STATE_PATTERN.exec(body);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(match[1], "base64").toString("utf8"),
    ) as unknown;

    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { v?: unknown; fingerprints?: unknown; lastReviewId?: unknown };

    if (record.v !== 1 || !Array.isArray(record.fingerprints)) return null;
    if (record.fingerprints.length > 1_000) return null;
    if (
      !record.fingerprints.every(
        (value) => typeof value === "string" && /^[a-f0-9]{16}$/.test(value),
      )
    ) {
      return null;
    }

    if (record.lastReviewId !== undefined &&
        (!Number.isSafeInteger(record.lastReviewId) || Number(record.lastReviewId) < 0)) return null;
    return {
      version: 1,
      fingerprints: record.fingerprints,
      ...(record.lastReviewId === undefined ? {} : { lastReviewId: record.lastReviewId as number }),
    };
  } catch {
    return null;
  }
}

export function isReviewerPost(post: { userType: string; userLogin: string }): boolean {
  return post.userType === "Bot" && post.userLogin === "github-actions[bot]";
}

export function findSummaryComment(
  comments: readonly SummaryCommentInfo[],
): SummaryCommentInfo | undefined {
  return [...comments]
    .filter((comment) => isReviewerPost(comment) && comment.body.includes(SUMMARY_COMMENT_MARKER))
    .sort((left, right) => left.id - right.id)[0];
}

export function findPreviousState(
  reviews: readonly ReviewInfo[],
  summary?: SummaryCommentInfo,
): ReviewState | null {
  const summaryState = summary && isReviewerPost(summary) ? decodeState(summary.body) : null;
  const botReviews = [...reviews]
    .filter((review) => isReviewerPost(review) && review.body.includes(SUMMARY_MARKER))
    .sort((left, right) => left.id - right.id);

  for (let index = botReviews.length - 1; index >= 0; index -= 1) {
    const review = botReviews[index]!;
    if (summaryState && review.id <= (summaryState.lastReviewId ?? 0)) break;
    const state = decodeState(review.body);
    if (state) return { ...state, lastReviewId: review.id };
  }

  return summaryState;
}

/**
 * Fingerprints that should not be posted inline again. The latest review state
 * is authoritative: findings that were fixed disappear from it, so a later
 * regression is reported again.
 */
export function collectPriorFingerprints(
  reviews: readonly ReviewInfo[],
  comments: readonly ReviewCommentInfo[],
  summary?: SummaryCommentInfo,
): Set<string> {
  const state = findPreviousState(reviews, summary);

  if (state) {
    return new Set(state.fingerprints);
  }

  const fingerprints = new Set<string>();

  for (const comment of comments) {
    if (!isReviewerPost(comment)) continue;
    for (const match of comment.body.matchAll(FINDING_PATTERN)) {
      if (match[1]) fingerprints.add(match[1]);
    }
  }

  return fingerprints;
}

export interface CompletedSummaryInput {
  pullRequest: PullRequestInfo;
  model: string;
  assessment: string;
  findings: readonly ReviewFinding[];
  previouslyReported: ReadonlySet<string>;
  inlineFallback: boolean;
  fullFindingDetails?: boolean;
  details: readonly string[];
  limitations: readonly string[];
  state: ReviewState;
}

export function renderCompletedSummary(input: CompletedSummaryInput): string {
  const counts = countBySeverity(input.findings);
  const total = input.findings.length;
  const lines: string[] = [
    SUMMARY_MARKER,
    "## Lovat AI review",
    "",
    `**Status:** completed · **Model:** \`${input.model}\` · **Findings:** ${total}`,
    "",
    `**Reviewed commit:** \`${input.pullRequest.headSha}\``,
    "",
    `${formatSeverityCount("Critical", counts.CRITICAL)} · ${formatSeverityCount("High", counts.HIGH)} · ${formatSeverityCount("Medium", counts.MEDIUM)} · ${formatSeverityCount("Low", counts.LOW)}`,
    "",
  ];

  if (input.assessment.trim().length > 0) {
    lines.push("### Overall assessment", "", input.assessment.trim(), "");
  }

  if (total === 0) {
    lines.push(
      "No high-confidence issues were found in the reviewed changes.",
      "",
    );
  } else {
    lines.push("### Findings", "");

    for (const severity of SEVERITIES) {
      const group = input.findings.filter(
        (finding) => finding.severity === severity,
      );
      if (group.length === 0) continue;

      lines.push(`#### ${titleCase(severity)} (${group.length})`, "");

      for (const finding of group) {
        lines.push(
          renderFinding(
            finding,
            input.previouslyReported.has(finding.fingerprint),
            input.inlineFallback || input.fullFindingDetails === true,
          ),
        );
      }

      lines.push("");
    }
  }

  if (input.details.length > 0) {
    lines.push("### Review details", "");
    for (const detail of input.details) {
      lines.push(`- ${detail}`);
    }
    lines.push("");
  }

  const limitations = [
    "The reviewer examined only changed lines and their diff context, not the whole repository.",
    ...input.limitations,
  ];

  lines.push("### Limitations", "");
  for (const limitation of limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push("", encodeState(input.state));

  return lines.join("\n");
}

export function renderNewFindingsReview(input: {
  findings: readonly ReviewFinding[];
  headSha: string;
  state: ReviewState;
  inlineFallback: boolean;
}): string {
  return [
    SUMMARY_MARKER,
    `**Lovat AI review:** ${input.findings.length} new finding(s) at \`${input.headSha}\`.`,
    "",
    "The persistent Lovat AI review comment contains the latest complete result.",
    "",
    ...input.findings.map((finding) => renderFinding(finding, false, input.inlineFallback)),
    "",
    encodeState(input.state),
  ].join("\n");
}

function renderFinding(
  finding: ReviewFinding,
  previouslyReported: boolean,
  forceFullDetail: boolean,
): string {
  const location = `\`${finding.file}:${finding.line}\``;
  const metadata = [
    `\`${finding.category}\``,
    `confidence ${finding.confidence.toFixed(2)}`,
    ...(previouslyReported ? ["previously reported, not repeated inline"] : []),
  ].join(" · ");
  const heading = `- **${location} — ${finding.title}** (${metadata})`;

  if (!forceFullDetail && finding.position !== null) {
    return heading;
  }

  return [
    heading,
    `  ${finding.description}`,
    "",
    `  **Suggestion:** ${finding.suggestion}`,
  ].join("\n");
}

export function renderInlineComment(
  finding: ReviewFinding,
  model: string,
): string {
  if (finding.position === null) {
    throw new Error("Cannot render an inline comment without a diff position.");
  }

  return [
    `**\`${finding.severity}\` · \`${finding.category}\`** — ${finding.title}`,
    "",
    finding.description,
    "",
    `**Suggested fix:** ${finding.suggestion}`,
    "",
    `<sub>Lovat AI review · confidence ${finding.confidence.toFixed(2)} · \`${model}\`</sub>`,
    findingMarker(finding.fingerprint),
  ].join("\n");
}

export interface FailureSummaryInput {
  model: string;
  message: string;
  runUrl?: string;
  state?: ReviewState | null;
  knownSecrets?: readonly string[];
  headSha?: string;
  previousSummary?: string;
}

export function renderFailureSummary(input: FailureSummaryInput): string {
  const safeMessage = redactSecrets(input.message, input.knownSecrets ?? []);
  const lines = [
    SUMMARY_MARKER,
    "## Lovat AI review failed",
    "",
    `**Status:** failed · **Model:** \`${input.model}\``,
    "",
    "The automated review did not complete. The latest commit has not been fully reviewed. This is not a clean review.",
    "",
    `**Error:** ${safeMessage}`,
  ];

  if (input.headSha) lines.push("", `**Unreviewed commit:** \`${input.headSha}\``);

  if (input.runUrl) {
    lines.push("", `[View the workflow run](${input.runUrl})`);
  }

  lines.push(
    "",
    "Push a new commit or re-run the workflow after fixing the failure.",
  );

  if (input.state) {
    lines.push("", encodeState(input.state));
  }

  // Retain the last successful result once, rather than nesting failure bodies
  // on each retry. Its commit label keeps earlier findings distinct from a
  // successful review of the current commit.
  const previous = input.previousSummary;
  if (previous) {
    const start = previous.indexOf(PREVIOUS_RESULT_START);
    const end = previous.indexOf(PREVIOUS_RESULT_END, start);
    const result = start >= 0 && end > start
      ? previous.slice(start + PREVIOUS_RESULT_START.length, end).trim()
      : previous.includes("**Status:** completed")
        ? previous.replace(SUMMARY_COMMENT_MARKER, "").trim()
        : null;
    if (result) {
      lines.push("", "<details>", "<summary>Last successful result (earlier review)</summary>", "",
        PREVIOUS_RESULT_START, result, PREVIOUS_RESULT_END, "", "</details>");
    }
  }

  return lines.join("\n");
}

function countBySeverity(
  findings: readonly ReviewFinding[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  return counts;
}

function formatSeverityCount(label: string, count: number): string {
  return `**${label}:** ${count}`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
