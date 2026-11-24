import { describe, expect, it } from "vitest";

import { GitHubApiError } from "../src/github.js";
import { runReview, type RunReviewInput } from "../src/run.js";
import { decodeState, encodeState } from "../src/summary.js";
import type { ModelReviewRequest, PullRequestFile } from "../src/types.js";
import {
  FakeGitHub,
  FakeModel,
  file,
  modelResponse,
  modelResult,
  rawFinding,
} from "./helpers.js";

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function input(
  github: FakeGitHub,
  model: FakeModel,
  overrides: Partial<RunReviewInput> = {},
): RunReviewInput {
  return {
    repoFullName: "HighlanderRobotics/lovat",
    pullNumber: 42,
    baseSha: "base-sha",
    headSha: "head-sha",
    env: { OPENROUTER_MODEL: "test/model" },
    github,
    createModel: () => model,
    logger: silentLogger,
    ...overrides,
  };
}

const guide = [
  "# Lovat code review",
  "Report writes must be scoped to the caller's team.",
].join("\n");

describe("runReview lifecycle", () => {
  it("publishes a summary and inline findings for a new pull request", async () => {
    const github = new FakeGitHub({
      contents: { "CODE_REVIEW.md": guide },
    });
    const model = new FakeModel(
      modelResponse([rawFinding({ line: 12 })], "Looks reasonable."),
    );

    const outcome = await runReview(input(github, model));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;

    expect(outcome.findings).toBe(1);
    expect(outcome.inlineComments).toBe(1);
    expect(outcome.batches).toBe(1);
    expect(github.createdReviews).toHaveLength(1);

    const review = github.createdReviews[0]!;
    expect(review.comments).toEqual([
      {
        path: "src/report.ts",
        line: 12,
        side: "RIGHT",
        body: expect.stringContaining("Missing null check"),
      },
    ]);
    expect(github.summaryComments).toHaveLength(1);
    const summary = github.summaryComments[0]!;
    expect(summary.body).toContain("## Lovat AI review");
    expect(summary.body).toContain("Looks reasonable.");
    expect(summary.body).toContain("**Reviewed commit:** `head-sha`");
    expect(decodeState(summary.body)).not.toBeNull();

    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]!.systemPrompt).toContain(guide);
    expect(model.calls[0]!.systemPrompt).toContain("untrusted input");
    expect(model.calls[0]!.userPrompt).toContain("src/report.ts");
    expect(model.calls[0]!.userPrompt).toContain("+  if (!report)");
  });

  it("logs review progress without exposing diffs or model content", async () => {
    const github = new FakeGitHub({
      contents: { "CODE_REVIEW.md": guide },
    });
    const model = new FakeModel(
      modelResponse([rawFinding({ line: 12 })], "Looks reasonable."),
    );
    const logs: string[] = [];
    const logger = {
      info: (message: string) => logs.push(`info:${message}`),
      warn: (message: string) => logs.push(`warn:${message}`),
      error: (message: string) => logs.push(`error:${message}`),
    };

    await runReview(input(github, model, { logger }));

    const output = logs.join("\n");
    expect(output).toContain("AI review starting:");
    expect(output).toContain("AI review config:");
    expect(output).toContain("AI review selection:");
    expect(output).toContain("AI review batching:");
    expect(output).toContain("AI review batch 1/1 starting:");
    expect(output).toContain("AI review batch 1/1 finished:");
    expect(output).toContain("AI review findings:");
    expect(output).toContain("AI review publishing:");
    expect(output).not.toContain("+  if (!report)");
    expect(output).not.toContain("Looks reasonable.");
    expect(output).not.toContain("Missing null check");
  });

  it("suppresses previously reported findings on later reviews", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel(
      modelResponse([rawFinding({ line: 12 })]),
    );

    await runReview(input(github, model));
    const second = await runReview(input(github, model));

    expect(second.status).toBe("completed");
    if (second.status !== "completed") return;

    expect(second.findings).toBe(1);
    expect(second.inlineComments).toBe(0);
    expect(second.suppressed).toBe(1);
    expect(github.createdReviews).toHaveLength(1);
    expect(github.summaryComments).toHaveLength(1);
    expect(github.updatedSummaryComments).toHaveLength(1);
    expect(github.summaryComments[0]!.body).toContain(
      "previously reported, not repeated inline",
    );
  });

  it("drops fixed findings and reports a regression again", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel([
      modelResponse([rawFinding({ line: 12 })]),
      modelResponse([]),
      modelResponse([rawFinding({ line: 12 })]),
    ]);

    await runReview(input(github, model));
    const fixed = await runReview(input(github, model));
    const regression = await runReview(input(github, model));

    expect(fixed.status).toBe("completed");
    if (fixed.status === "completed") {
      expect(fixed.findings).toBe(0);
      expect(fixed.suppressed).toBe(0);
    }

    expect(regression.status).toBe("completed");
    if (regression.status === "completed") {
      expect(regression.findings).toBe(1);
      expect(regression.inlineComments).toBe(1);
      expect(regression.suppressed).toBe(0);
    }
  });

  it("publishes only newly discovered findings on an updated review", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel([
      modelResponse([rawFinding({ title: "Missing null check", line: 12 })]),
      modelResponse([
        rawFinding({ title: "Missing null check", line: 12 }),
        rawFinding({
          title: "Unscoped report lookup",
          line: 13,
          category: "SECURITY",
        }),
      ]),
    ]);

    await runReview(input(github, model));
    const second = await runReview(input(github, model));

    expect(second.status).toBe("completed");
    if (second.status !== "completed") return;

    expect(second.findings).toBe(2);
    expect(second.suppressed).toBe(1);
    expect(second.inlineComments).toBe(1);
    expect(github.createdReviews[1]!.comments).toHaveLength(1);
    expect(github.createdReviews[1]!.comments[0]!.body).toContain(
      "Unscoped report lookup",
    );
  });

  it("splits a large pull request into batches without omitting files", async () => {
    const files: PullRequestFile[] = Array.from({ length: 5 }, (_, index) =>
      file(`src/file-${index}.ts`, [
        "@@ -1,2 +1,3 @@",
        " context",
        `+value-${index}-${"x".repeat(300)}`,
        "+another",
      ].join("\n")),
    );

    const github = new FakeGitHub({
      pullRequest: { changedFiles: files.length },
      files,
    });
    const model = new FakeModel(() => modelResult(modelResponse([])));

    const outcome = await runReview(
      input(github, model, {
        env: {
          OPENROUTER_MODEL: "test/model",
          REVIEW_MAX_DIFF_CHARACTERS: "1000",
        },
      }),
    );

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;

    expect(outcome.batches).toBeGreaterThan(1);
    expect(model.calls).toHaveLength(outcome.batches);

    const prompts = model.calls.map((call) => call.userPrompt).join("\n");
    for (let index = 0; index < files.length; index += 1) {
      expect(prompts).toContain(`src/file-${index}.ts`);
      expect(prompts).toContain(`+value-${index}-`);
    }

    const types = model.calls.map((call: ModelReviewRequest) => call.batchIndex);
    expect(types).toEqual([...types].sort((a, b) => a - b));
    expect(github.summaryComments[0]!.body).toContain(
      `Review batches: ${outcome.batches}`,
    );
  });

  it("skips disabled reviewers and draft pull requests", async () => {
    const disabled = new FakeGitHub({
      contents: { ".lovat-review.json": JSON.stringify({ enabled: false }) },
    });
    const disabledModel = new FakeModel(modelResponse([]));
    const disabledOutcome = await runReview(input(disabled, disabledModel));

    expect(disabledOutcome.status).toBe("skipped");
    expect(disabledModel.calls).toHaveLength(0);
    expect(disabled.createdReviews).toHaveLength(0);

    const draft = new FakeGitHub({ pullRequest: { draft: true } });
    const draftModel = new FakeModel(modelResponse([]));
    const draftOutcome = await runReview(input(draft, draftModel));

    expect(draftOutcome.status).toBe("skipped");
    expect(draftModel.calls).toHaveLength(0);
  });

  it("updates the persistent summary on failure and preserves prior state", async () => {
    const github = new FakeGitHub();
    const successModel = new FakeModel(modelResponse([rawFinding({ line: 12 })]));
    await runReview(input(github, successModel));

    const previousState = decodeState(github.summaryComments[0]!.body);
    expect(previousState).not.toBeNull();

    const failingModel = new FakeModel(() => {
      throw new Error("provider rejected key sk-or-v1-abcdefghijklmnopqrstuvwxyz");
    });

    const outcome = await runReview(
      input(github, failingModel, {
        knownSecrets: ["sk-or-v1-abcdefghijklmnopqrstuvwxyz"],
      }),
    );

    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.error).not.toContain("sk-or-v1-abcdefghijklmnopqrstuvwxyz");
    }

    expect(github.createdReviews).toHaveLength(1);
    expect(github.summaryComments).toHaveLength(1);
    const failure = github.summaryComments[0]!;
    expect(failure.body).toContain("## Lovat AI review failed");
    expect(failure.body).not.toContain("sk-or-v1-abcdefghijklmnopqrstuvwxyz");
    expect(failure.body).toContain("**Unreviewed commit:** `head-sha`");
    expect(github.minimizedReviews).toEqual([]);
    expect(decodeState(failure.body)).toEqual(previousState);
    expect(failure.body).toContain("Last successful result (earlier review)");
    expect(failure.body).toContain("Missing null check");
    await runReview(input(github, failingModel));
    expect(github.summaryComments[0]!.body.match(/Last successful result/g)).toHaveLength(1);
    expect(github.createdReviews).toHaveLength(1);
  });

  it("fails visibly when the model returns malformed JSON", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel("this is not JSON");

    const outcome = await runReview(input(github, model));

    expect(outcome.status).toBe("failed");
    expect(github.summaryComments[0]!.body).toContain(
      "## Lovat AI review failed",
    );
  });

  it("moves findings into the summary when GitHub rejects inline positions", async () => {
    const github = new FakeGitHub();
    github.createReviewFailures.push(
      new GitHubApiError("position is not part of the diff", 422),
    );
    const model = new FakeModel(modelResponse([rawFinding({ line: 12 })]));

    const outcome = await runReview(input(github, model));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;

    expect(outcome.findings).toBe(1);
    expect(outcome.inlineComments).toBe(0);
    expect(github.createdReviews).toHaveLength(1);
    expect(github.createdReviews[0]!.comments).toEqual([]);
    expect(github.summaryComments[0]!.body).toContain(
      "GitHub rejected one or more inline comment positions",
    );
    expect(github.createdReviews[0]!.body).toContain(
      "The report can be null when the id is unknown",
    );
  });

  it("publishes a clean summary when nothing reviewable changed", async () => {
    const github = new FakeGitHub({
      files: [file("apps/server/package-lock.json")],
      pullRequest: { changedFiles: 1 },
    });
    const model = new FakeModel(modelResponse([]));

    const outcome = await runReview(input(github, model));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;

    expect(outcome.batches).toBe(0);
    expect(model.calls).toHaveLength(0);
    expect(github.createdReviews).toHaveLength(0);
    expect(github.summaryComments[0]!.body).toContain(
      "No high-confidence issues were found",
    );
    expect(github.summaryComments[0]!.body).toContain(
      "Files excluded by configuration: 1",
    );
  });

  it("reports files GitHub could not return a patch for as a limitation", async () => {
    const github = new FakeGitHub({
      pullRequest: { changedFiles: 1 },
      files: [file("src/no-patch.ts", null)],
    });
    const model = new FakeModel(modelResponse([]));

    const outcome = await runReview(input(github, model));

    expect(outcome.status).toBe("completed");
    expect(github.summaryComments[0]!.body).toContain(
      "GitHub did not return a patch for 1 file(s)",
    );
  });

  it("applies the confidence threshold and finding cap", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel(
      modelResponse([
        rawFinding({ title: "Low confidence", confidence: 0.2 }),
        rawFinding({ title: "Accepted", line: 13 }),
      ]),
    );

    const outcome = await runReview(
      input(github, model, {
        env: {
          OPENROUTER_MODEL: "test/model",
          REVIEW_MIN_CONFIDENCE: "0.75",
          REVIEW_MAX_FINDINGS: "1",
        },
      }),
    );

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;

    expect(outcome.findings).toBe(1);
    const body = github.summaryComments[0]!.body;
    expect(body).toContain("Findings below the 0.75 confidence threshold: 1");
  });
});

describe("persistent review publishing", () => {
  it("keeps clean results and repeated failures in one comment without reviews", async () => {
    const github = new FakeGitHub();
    await runReview(input(github, new FakeModel(modelResponse([]))));
    const failingModel = new FakeModel(() => { throw new Error("offline"); });
    for (let index = 0; index < 2; index += 1) {
      const outcome = await runReview(input(github, failingModel, { runUrl: "https://github.com/org/repo/actions/runs/7" }));
      expect(outcome.status).toBe("failed");
    }
    expect(github.summaryComments).toHaveLength(1);
    expect(github.createdSummaryComments).toHaveLength(1);
    expect(github.updatedSummaryComments).toHaveLength(2);
    expect(github.createdReviews).toHaveLength(0);
    expect(github.summaryComments[0]!.body).toContain("View the workflow run");
    expect(github.minimizedReviews).toEqual([]);
  });

  it("minimizes legacy Lovat reviews after replacing the summary, leaving other authors alone", async () => {
    const github = new FakeGitHub();
    const body = `<!-- lovat-review:summary -->\n${encodeState({ version: 1, fingerprints: [] })}`;
    github.reviews = [
      { id: 10, nodeId: "legacy-lovat", body, userType: "Bot", userLogin: "github-actions[bot]" },
      { id: 11, nodeId: "human", body, userType: "User", userLogin: "student" },
      { id: 12, nodeId: "other-bot", body, userType: "Bot", userLogin: "another[bot]" },
      { id: 13, nodeId: "unmarked", body: "Another workflow's review", userType: "Bot", userLogin: "github-actions[bot]" },
    ];
    const minimize = github.minimizeReview.bind(github);
    github.minimizeReview = async (id) => {
      expect(github.summaryComments[0]!.body).toContain("**Status:** completed");
      await minimize(id);
    };
    const outcome = await runReview(input(github, new FakeModel(modelResponse([]))));
    expect(outcome.status).toBe("completed");
    expect(github.minimizedReviews).toEqual(["legacy-lovat"]);
    expect(github.createdReviews).toHaveLength(0);
  });

  it("keeps the new review expanded and includes full active finding details in the summary", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel([
      modelResponse([rawFinding()]),
      modelResponse([rawFinding(), rawFinding({ title: "New issue", line: 13 })]),
    ]);
    await runReview(input(github, model));
    expect(github.minimizedReviews).toEqual([]);
    await runReview(input(github, model));
    expect(github.minimizedReviews).toEqual([github.reviews[0]!.nodeId]);
    expect(github.createdReviews[1]!.body).toContain("New issue");
    expect(github.createdReviews[1]!.body).not.toContain("Missing null check");
    const body = github.summaryComments[0]!.body;
    expect(body).toContain("Missing null check");
    expect(body).toContain("New issue");
    expect(body).toContain("The report can be null when the id is unknown");
  });

  it("logs a cleanup permission failure without failing the published review", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel(modelResponse([rawFinding()]));
    await runReview(input(github, model));
    github.minimizeFailure = new GitHubApiError("forbidden", 403);
    const warnings: string[] = [];
    const outcome = await runReview(input(github, model, {
      logger: { ...silentLogger, warn: (message) => warnings.push(message) },
    }));
    expect(outcome.status).toBe("completed");
    expect(github.summaryComments[0]!.body).toContain("**Status:** completed");
    expect(warnings.join("\n")).toContain("Could not minimize superseded AI review");
  });

  it("does not minimize reviews until summary publication succeeds, and recovers duplicate state", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel(modelResponse([rawFinding()]));
    github.summaryFailure = new Error("summary unavailable");
    const failed = await runReview(input(github, model));
    expect(failed.status).toBe("failed");
    expect(github.createdReviews).toHaveLength(1);
    expect(github.minimizedReviews).toEqual([]);
    github.summaryFailure = undefined;
    const recovered = await runReview(input(github, model));
    expect(recovered.status).toBe("completed");
    expect(github.createdReviews).toHaveLength(1);
    expect(github.summaryComments).toHaveLength(1);
    expect(github.minimizedReviews).toEqual([github.reviews[0]!.nodeId]);
  });

  it("recovers newer review state when updating an existing summary failed", async () => {
    const github = new FakeGitHub();
    const clean = new FakeModel(modelResponse([]));
    await runReview(input(github, clean));
    github.summaryFailure = new Error("summary unavailable");
    const findings = new FakeModel(modelResponse([rawFinding()]));
    await runReview(input(github, findings));
    expect(github.createdReviews).toHaveLength(1);
    github.summaryFailure = undefined;
    const recovered = await runReview(input(github, findings));
    expect(recovered.status).toBe("completed");
    expect(github.createdReviews).toHaveLength(1);
    expect(github.summaryComments).toHaveLength(1);
    expect(decodeState(github.summaryComments[0]!.body)?.fingerprints).toHaveLength(1);
  });

  it("ignores spoofed persistent summary markers from people and other bots", async () => {
    const github = new FakeGitHub();
    const body = "<!-- lovat-review:persistent-summary -->";
    github.summaryComments.push(
      { id: 5, body, userType: "User", userLogin: "student" },
      { id: 6, body, userType: "Bot", userLogin: "another[bot]" },
    );
    await runReview(input(github, new FakeModel(modelResponse([]))));
    expect(github.createdSummaryComments).toHaveLength(1);
    expect(github.updatedSummaryComments).toHaveLength(0);
    expect(github.summaryComments.slice(0, 2).map((comment) => comment.body)).toEqual([body, body]);
  });

  it("reports positionless findings once and updates their full details in the summary", async () => {
    const github = new FakeGitHub();
    const model = new FakeModel(modelResponse([rawFinding({ line: 100 })]));
    await runReview(input(github, model));
    await runReview(input(github, model));
    expect(github.createdReviews).toHaveLength(1);
    expect(github.createdReviews[0]!.comments).toHaveLength(0);
    expect(github.createdReviews[0]!.body).toContain("The report can be null");
    expect(github.summaryComments).toHaveLength(1);
    expect(github.summaryComments[0]!.body).toContain("The report can be null");
  });

  it("does not publish stale successes or stale failures after a new push", async () => {
    for (const fail of [false, true]) {
      const github = new FakeGitHub();
      const model = new FakeModel(() => {
        github.pullRequest = { ...github.pullRequest, headSha: "new-head" };
        if (fail) throw new Error("old request failed");
        return modelResult(modelResponse([rawFinding()]));
      });
      await runReview(input(github, model));
      expect(github.summaryComments).toHaveLength(0);
      expect(github.createdReviews).toHaveLength(0);
      expect(github.minimizedReviews).toHaveLength(0);
    }
  });
});
