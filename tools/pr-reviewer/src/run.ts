import { GitHubApiError } from "./github.js";
import { loadConfig, loadReviewGuide, type ReviewConfig } from "./config.js";
import { planBatches, selectReviewableFiles } from "./diff.js";
import { prepareFindings } from "./findings.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { parseModelResponse } from "./response.js";
import { safeErrorMessage } from "./redact.js";
import {
  collectPriorFingerprints,
  findPreviousState,
  findSummaryComment,
  isReviewerPost,
  SUMMARY_MARKER,
  SUMMARY_COMMENT_MARKER,
  renderNewFindingsReview,
  renderCompletedSummary,
  renderFailureSummary,
  renderInlineComment,
  type ReviewState,
} from "./summary.js";
import type {
  Logger,
  ModelFinding,
  ModelUsage,
  ReviewerModel,
  ReviewGitHub,
  SummaryCommentInfo,
} from "./types.js";

export interface RunReviewInput {
  repoFullName: string;
  pullNumber: number;
  baseSha: string;
  headSha: string;
  env: NodeJS.ProcessEnv;
  github: ReviewGitHub;
  createModel: (model: string, config: ReviewConfig) => ReviewerModel;
  logger?: Logger;
  runUrl?: string;
  knownSecrets?: readonly string[];
}

export type ReviewOutcome =
  | {
      status: "completed";
      findings: number;
      inlineComments: number;
      suppressed: number;
      batches: number;
      usage: ModelUsage;
      durationMs: number;
    }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message, error) => {
    if (error === undefined) console.error(message);
    else console.error(message, error);
  },
};

/**
 * Run one complete review. Failures update the persistent summary
 * before the outcome is returned; the workflow then exits non-zero.
 */
export async function runReview(input: RunReviewInput): Promise<ReviewOutcome> {
  const logger = input.logger ?? consoleLogger;
  let config: ReviewConfig | undefined;

  try {
    return await runReviewInner(input, (resolved) => {
      config = resolved;
    }, logger);
  } catch (error) {
    const model =
      config?.model ?? input.env.OPENROUTER_MODEL?.trim() ?? "unknown";
    const message = safeErrorMessage(
      error,
      input.knownSecrets ?? [],
    );

    logger.error(`AI review failed: ${message}`);
    await publishFailure(input, model, message, logger);

    return { status: "failed", error: message };
  }
}

async function runReviewInner(
  input: RunReviewInput,
  onConfig: (config: ReviewConfig) => void,
  logger: Logger,
): Promise<ReviewOutcome> {
  const pullRequest = await input.github.getPullRequest();
  logger.info(
    `AI review starting: ${input.repoFullName}#${input.pullNumber} at ${shortSha(pullRequest.headSha)} (base ${shortSha(pullRequest.baseSha)}), ${pullRequest.changedFiles} changed file(s)${pullRequest.draft ? ", draft" : ""}.`,
  );

  if (pullRequest.headSha !== input.headSha || pullRequest.state !== "open") {
    return { status: "skipped", reason: "pull request is closed or the workflow commit is superseded" };
  }

  const config = await loadConfig(input.github, input.baseSha, input.env);
  onConfig(config);
  logger.info(
    `AI review config: model=${config.model}, max_output_tokens=${config.maxOutputTokens}, max_input_tokens=${config.maxInputTokens ?? "unset"}, max_diff_characters=${config.maxDiffCharacters}, max_findings=${config.maxFindings}, min_confidence=${config.minimumConfidence}, max_retries=${config.maxRetries}, timeout_ms=${config.requestTimeoutMs}, review_drafts=${config.reviewDrafts}.`,
  );

  if (!config.enabled) {
    return { status: "skipped", reason: "reviewer is disabled by configuration" };
  }

  if (pullRequest.draft && !config.reviewDrafts) {
    return { status: "skipped", reason: "draft pull requests are not reviewed" };
  }

  const guide = await loadReviewGuide(input.github, input.baseSha);
  const systemPrompt = buildSystemPrompt({ guide: guide.text, config });
  const files = await input.github.listPullRequestFiles();
  const selection = selectReviewableFiles(files, config.excludedPaths);
  logger.info(
    `AI review selection: ${selection.reviewable.length} reviewable file(s), ${selection.excluded.length} excluded, ${selection.missingPatch.length} without a patch, ${files.length}/${pullRequest.changedFiles} changed file(s) returned, guide_chars=${guide.text.length}${guide.truncated ? " (truncated)" : ""}.`,
  );

  const inputBudget =
    config.maxInputTokens === undefined
      ? undefined
      : config.maxInputTokens * 4 - systemPrompt.length - 2_000;
  const budgetIsBelowMinimum =
    inputBudget !== undefined && inputBudget < config.maxDiffCharacters;
  const diffBudget =
    inputBudget === undefined
      ? config.maxDiffCharacters
      : Math.max(1_000, Math.min(config.maxDiffCharacters, inputBudget));
  const batches = planBatches(selection.reviewable, diffBudget);
  const diffCharacters = batches.reduce(
    (total, batch) =>
      total +
      batch.segments.reduce((sum, segment) => sum + segment.patch.length, 0),
    0,
  );
  logger.info(
    `AI review batching: ${batches.length} batch(es), ${diffCharacters.toLocaleString("en-US")} diff character(s), per-batch budget ${diffBudget.toLocaleString("en-US")}${budgetIsBelowMinimum ? " (configured input budget is below the prompt size)" : ""}.`,
  );

  const [reviews, comments, summaryComments] = await Promise.all([
    input.github.listReviews(),
    input.github.listReviewComments(),
    input.github.listSummaryComments(),
  ]);
  const summary = findSummaryComment(summaryComments);
  const previousState = findPreviousState(reviews, summary);
  const priorFingerprints = collectPriorFingerprints(reviews, comments, summary);
  logger.info(
    `AI review state: ${reviews.length} prior review(s), ${comments.length} prior comment(s), ${priorFingerprints.size} known finding fingerprint(s).`,
  );

  const rawFindings: ModelFinding[] = [];
  const assessments: string[] = [];
  let usage: ModelUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  let invalidFindings = 0;
  let usedJsonSchema = true;
  let modelDurationMs = 0;
  let model: ReviewerModel | null = null;

  if (batches.length > 0) {
    model = input.createModel(config.model, config);

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index]!;
      const userPrompt = buildUserPrompt({
        repoFullName: input.repoFullName,
        pullRequest,
        batch,
        batchIndex: index,
        batchCount: batches.length,
        maxFindings: config.maxFindings,
      });
      const batchFiles = new Set(batch.segments.map((segment) => segment.path));
      logger.info(
        `AI review batch ${index + 1}/${batches.length} starting: ${batchFiles.size} file(s), ${batch.segments.length} segment(s), ${batch.characters.toLocaleString("en-US")} diff character(s), prompt ${(systemPrompt.length + userPrompt.length).toLocaleString("en-US")} characters.`,
      );

      const result = await model.review({
        systemPrompt,
        userPrompt,
        batchIndex: index,
        batchCount: batches.length,
      });

      const parsed = parseModelResponse(result.content);
      rawFindings.push(...parsed.findings);
      invalidFindings += parsed.invalidFindings;

      if (parsed.assessment.length > 0) {
        assessments.push(parsed.assessment);
      }

      usage = addUsage(usage, result.usage);
      usedJsonSchema = usedJsonSchema && result.usedJsonSchema;
      modelDurationMs += result.durationMs;

      logger.info(
        `AI review batch ${index + 1}/${batches.length} finished: ${result.durationMs}ms, ${result.usage.promptTokens.toLocaleString("en-US")} prompt + ${result.usage.completionTokens.toLocaleString("en-US")} completion tokens, finish_reason=${result.finishReason ?? "none"}, structured_output=${result.usedJsonSchema}, response_chars=${result.content.length}, findings=${parsed.findings.length}, invalid_findings=${parsed.invalidFindings}, assessment_chars=${parsed.assessment.length}.`,
      );
    }

    logger.info(
      `AI review model calls complete: ${batches.length} batch(es) in ${modelDurationMs}ms, ${rawFindings.length} raw finding(s), ${usage.totalTokens.toLocaleString("en-US")} total token(s)${usage.costUsd === undefined ? "" : `, estimated cost $${usage.costUsd.toFixed(4)}`}.`,
    );
  } else {
    logger.info(
      "AI review model calls skipped: no reviewable diff was found.",
    );
  }

  const prepared = prepareFindings(rawFindings, {
    repoFullName: input.repoFullName,
    pullNumber: input.pullNumber,
    files,
    categories: config.categories,
    minimumConfidence: config.minimumConfidence,
    maxFindings: config.maxFindings,
    ...(input.knownSecrets === undefined
      ? {}
      : { knownSecrets: input.knownSecrets }),
  });

  const previouslyReported = new Set(
    prepared.findings
      .filter((finding) => priorFingerprints.has(finding.fingerprint))
      .map((finding) => finding.fingerprint),
  );
  const newFindings = prepared.findings.filter(
    (finding) => !priorFingerprints.has(finding.fingerprint),
  );
  const positionlessNewFindings = newFindings.filter(
    (finding) => finding.position === null,
  );

  const state: ReviewState = {
    version: 1,
    fingerprints: prepared.findings.map((finding) => finding.fingerprint),
    lastReviewId: previousState?.lastReviewId ?? 0,
  };

  const details = buildDetails({
    batches: batches.length,
    diffCharacters,
    usage,
    suppressedCount: previouslyReported.size,
    stats: prepared.stats,
    invalidFindings,
    excludedFiles: selection.excluded.length,
    usedJsonSchema,
    minimumConfidence: config.minimumConfidence,
    maxFindings: config.maxFindings,
  });

  const limitations = buildLimitations({
    missingPatch: selection.missingPatch,
    changedFiles: pullRequest.changedFiles,
    returnedFiles: files.length,
    guideTruncated: guide.truncated,
    invalidFindings,
    capped: prepared.stats.capped,
    positionlessNewFindings: positionlessNewFindings.length,
    budgetIsBelowMinimum,
    maxInputTokens: config.maxInputTokens,
    usedJsonSchema,
  });

  const assessment = unique(assessments).join("\n\n").slice(0, 4_000);
  const summaryInput = {
    pullRequest,
    model: config.model,
    assessment,
    findings: prepared.findings,
    previouslyReported,
    details,
    limitations,
    state,
  };

  const inlineComments = newFindings
    .filter((finding) => finding.position !== null)
    .map((finding) => ({
      path: finding.file,
      line: finding.position!.line,
      side: finding.position!.side,
      body: renderInlineComment(finding, config.model),
    }));

  logger.info(
    `AI review findings: ${prepared.findings.length} accepted, ${previouslyReported.size} previously reported, ${newFindings.length} new, ${positionlessNewFindings.length} summary-only, ${prepared.stats.filteredByConfidence} below confidence, ${prepared.stats.filteredByCategory} outside categories, ${prepared.stats.unknownFile} outside the diff, ${prepared.stats.duplicated} duplicate(s), ${prepared.stats.capped} capped.`,
  );

  // A cancelled workflow can still finish an in-flight model request. Do not
  // replace the latest summary with a result for a superseded commit.
  const latest = await input.github.getPullRequest();
  if (latest.headSha !== input.headSha || latest.state !== "open") {
    return { status: "skipped", reason: "pull request is closed or the workflow commit is superseded" };
  }

  let inlineFallback = false;
  logger.info(
    `AI review publishing: ${inlineComments.length} inline comment(s), ${newFindings.length} new finding(s), persistent summary.`,
  );

  if (newFindings.length > 0) {
    const reviewBody = (fallback: boolean) => renderNewFindingsReview({
      findings: newFindings,
      headSha: input.headSha,
      state,
      inlineFallback: fallback,
    });
    try {
      const review = await input.github.createReview({
        body: reviewBody(false), comments: inlineComments,
      });
      state.lastReviewId = review.id;
    } catch (error) {
      if (inlineComments.length > 0 && error instanceof GitHubApiError && error.status === 422) {
        // The full finding details will be available in the persistent summary.
        // Keep a recoverable copy in the new review if summary updating fails.
        inlineFallback = true;
        logger.warn("GitHub rejected inline positions; publishing findings in the persistent summary.");
        const review = await input.github.createReview({ body: reviewBody(true), comments: [] });
        state.lastReviewId = review.id;
      } else {
        throw error;
      }
    }
  }

  const body = renderCompletedSummary({
    ...summaryInput,
    inlineFallback,
    fullFindingDetails: true,
    limitations: inlineFallback
      ? [...limitations, "GitHub rejected one or more inline comment positions, so every finding appears in this summary instead."]
      : limitations,
  });
  await publishSummary(input.github, summary, body);

  // Cleanup is best-effort and happens only after the replacement is visible.
  // The snapshot excludes the new review, which stays expanded for discussion.
  for (const review of reviews) {
    if (!isReviewerPost(review) || !review.body.includes(SUMMARY_MARKER) || !review.nodeId) continue;
    try {
      await input.github.minimizeReview(review.nodeId);
    } catch (error) {
      logger.warn(`Could not minimize superseded AI review ${review.id}: ${safeErrorMessage(error, input.knownSecrets ?? [])}`);
    }
  }

  logger.info(
    `AI review completed: ${prepared.findings.length} finding(s), ${inlineComments.length} inline comment(s), ${previouslyReported.size} previously reported.`,
  );

  return {
    status: "completed",
    findings: prepared.findings.length,
    inlineComments: inlineFallback ? 0 : inlineComments.length,
    suppressed: previouslyReported.size,
    batches: batches.length,
    usage,
    durationMs: modelDurationMs,
  };
}

async function publishFailure(
  input: RunReviewInput,
  model: string,
  message: string,
  logger: Logger,
): Promise<void> {
  try {
    const latest = await input.github.getPullRequest();
    if (latest.headSha !== input.headSha || latest.state !== "open") return;
    const [reviews, comments] = await Promise.all([
      input.github.listReviews(), input.github.listSummaryComments(),
    ]);
    const summary = findSummaryComment(comments);
    const state = findPreviousState(reviews, summary);
    const body = renderFailureSummary({
      model,
      message,
      headSha: input.headSha,
      previousSummary: summary?.body,
      ...(input.runUrl === undefined ? {} : { runUrl: input.runUrl }),
      state,
      ...(input.knownSecrets === undefined
        ? {}
        : { knownSecrets: input.knownSecrets }),
    });

    await publishSummary(input.github, summary, body);
  } catch (error) {
    logger.error(
      "Could not publish the failed-review summary to GitHub.",
      safeErrorMessage(error, input.knownSecrets ?? []),
    );
  }
}

async function publishSummary(
  github: ReviewGitHub,
  summary: SummaryCommentInfo | undefined,
  body: string,
): Promise<void> {
  const markedBody = `${SUMMARY_COMMENT_MARKER}\n${body}`;
  if (summary) await github.updateSummaryComment(summary.id, markedBody);
  else await github.createSummaryComment(markedBody);
}

function buildDetails(input: {
  batches: number;
  diffCharacters: number;
  usage: ModelUsage;
  suppressedCount: number;
  stats: {
    filteredByCategory: number;
    filteredByConfidence: number;
    unknownFile: number;
    duplicated: number;
    capped: number;
  };
  invalidFindings: number;
  excludedFiles: number;
  usedJsonSchema: boolean;
  minimumConfidence: number;
  maxFindings: number;
}): string[] {
  const details: string[] = [
    `Review batches: ${input.batches}`,
    `Diff characters reviewed: ${input.diffCharacters.toLocaleString("en-US")}`,
    `Tokens: ${input.usage.promptTokens.toLocaleString("en-US")} prompt + ${input.usage.completionTokens.toLocaleString("en-US")} completion`,
  ];

  if (input.usage.costUsd !== undefined) {
    details.push(`Estimated inference cost: $${input.usage.costUsd.toFixed(4)}`);
  }

  if (input.suppressedCount > 0) {
    details.push(
      `Previously reported findings not repeated inline: ${input.suppressedCount}`,
    );
  }

  if (input.excludedFiles > 0) {
    details.push(`Files excluded by configuration: ${input.excludedFiles}`);
  }

  if (input.stats.filteredByConfidence > 0) {
    details.push(
      `Findings below the ${input.minimumConfidence.toFixed(2)} confidence threshold: ${input.stats.filteredByConfidence}`,
    );
  }

  if (input.stats.filteredByCategory > 0) {
    details.push(
      `Findings outside the enabled categories: ${input.stats.filteredByCategory}`,
    );
  }

  if (input.stats.unknownFile > 0) {
    details.push(
      `Findings referencing files outside the reviewed diff: ${input.stats.unknownFile}`,
    );
  }

  if (input.stats.duplicated > 0) {
    details.push(`Duplicate model findings merged: ${input.stats.duplicated}`);
  }

  if (input.invalidFindings > 0) {
    details.push(
      `Model findings rejected by schema validation: ${input.invalidFindings}`,
    );
  }

  if (input.stats.capped > 0) {
    details.push(
      `Findings omitted after reaching the ${input.maxFindings} finding limit: ${input.stats.capped}`,
    );
  }

  if (!input.usedJsonSchema) {
    details.push(
      "The provider rejected structured-output mode; responses were still validated with Zod.",
    );
  }

  return details;
}

function buildLimitations(input: {
  missingPatch: readonly string[];
  changedFiles: number;
  returnedFiles: number;
  guideTruncated: boolean;
  invalidFindings: number;
  capped: number;
  positionlessNewFindings: number;
  budgetIsBelowMinimum: boolean;
  maxInputTokens?: number;
  usedJsonSchema: boolean;
}): string[] {
  const limitations: string[] = [];

  if (input.missingPatch.length > 0) {
    const shown = input.missingPatch.slice(0, 10);
    const remainder = input.missingPatch.length - shown.length;
    limitations.push(
      `GitHub did not return a patch for ${input.missingPatch.length} file(s), so they could not be reviewed: ${shown.join(", ")}${remainder > 0 ? `, and ${remainder} more` : ""}.`,
    );
  }

  if (input.changedFiles > input.returnedFiles) {
    limitations.push(
      `GitHub reported ${input.changedFiles} changed files but returned ${input.returnedFiles}; files beyond GitHub's API limit were not reviewed.`,
    );
  }

  if (input.guideTruncated) {
    limitations.push(
      "CODE_REVIEW.md was truncated because it exceeded the review guide size limit.",
    );
  }

  if (input.invalidFindings > 0) {
    limitations.push(
      `${input.invalidFindings} model finding(s) did not match the required schema and were discarded.`,
    );
  }

  if (input.capped > 0) {
    limitations.push(
      `${input.capped} additional finding(s) were omitted because the review reached its finding limit.`,
    );
  }

  if (input.positionlessNewFindings > 0) {
    limitations.push(
      `${input.positionlessNewFindings} finding(s) did not land on a changed line and appear only in this summary.`,
    );
  }

  if (input.budgetIsBelowMinimum) {
    limitations.push(
      `The configured maxInputTokens (${input.maxInputTokens ?? "unknown"}) is smaller than the review prompt, so batched requests may exceed the configured token budget.`,
    );
  }

  return limitations;
}

function addUsage(left: ModelUsage, right: ModelUsage): ModelUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    ...(left.costUsd === undefined && right.costUsd === undefined
      ? {}
      : { costUsd: (left.costUsd ?? 0) + (right.costUsd ?? 0) }),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shortSha(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}
