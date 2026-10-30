# Lovat AI pull request reviewer

Automated, OpenRouter-powered review for pull requests in this repository. The
reviewer reads changed diff lines, asks a model for structured findings, and
publishes a GitHub review with inline comments where GitHub accepts a position.

The tool lives in `tools/pr-reviewer` and has its own `package.json` and
lockfile. It is not part of a root workspace and does not change any
application's dependencies.

## How a review runs

The workflow is [`.github/workflows/ai-review.yml`](../../.github/workflows/ai-review.yml).

- It triggers on `pull_request` `opened`, `synchronize`, `reopened`, and
  `ready_for_review`. Editing only a title or description does not start a
  review.
- It checks out and runs the reviewer from the pull request's **base** revision,
  so a pull request cannot change the reviewer that inspects it.
- `.lovat-review.json` and `CODE_REVIEW.md` are also read at the base revision
  for the same reason.
- Only file patches returned by GitHub are reviewed. Pull request code is never
  checked out, built, installed, or executed.
- Fork pull requests are skipped. Repository secrets are not available to fork
  workflows, and reviewing a fork from a privileged context would expose the
  OpenRouter key.
- Draft pull requests are skipped unless `reviewDrafts` is enabled.
- Concurrent runs for the same pull request are cancelled when a newer commit
  arrives.

The workflow needs two repository settings:

| Setting | Kind | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Actions secret | Authenticates requests to OpenRouter. Required. |
| `OPENROUTER_MODEL` | Actions variable | Overrides the model in `.lovat-review.json`. Optional. |

Set them under **Settings → Secrets and variables → Actions**. The model value
must be an OpenRouter model identifier such as `anthropic/claude-sonnet-5.5`.
The checked-in configuration supplies a default, so the variable can be left
unset.

Workflow permissions are limited to `contents: read` and `pull-requests: write`.
The reviewer uses the workflow token to read the pull request and file contents
and to create a review. It does not need `checks: write`, `contents: write`, or
access to any other secret.

## Configuration

`.lovat-review.json` is strict JSON. Unknown keys fail the review instead of
being ignored. All fields are optional because the tool applies defaults.

| Field | Default | Behavior |
|---|---|---|
| `enabled` | `true` | Set to `false` to skip reviews without removing the workflow. |
| `reviewDrafts` | `false` | Review draft pull requests. |
| `model` | required | OpenRouter model identifier. `OPENROUTER_MODEL` wins when set. |
| `maxDiffCharacters` | `80000` | Approximate diff budget per model request. Larger diffs are split into batches. |
| `maxFindings` | `20` | Maximum findings kept across the whole review. |
| `minimumConfidence` | `0.75` | Findings below this confidence are discarded. |
| `excludedPaths` | built-in list | Gitignore-like globs. An explicit list **replaces** the defaults. |
| `categories` | all | Allowed categories: `BUG`, `SECURITY`, `PERFORMANCE`, `DATABASE`, `TYPE_SAFETY`, `ARCHITECTURE`. |
| `temperature` | `0.1` | Sampling temperature. |
| `maxOutputTokens` | `4096` | Per-request output limit. |
| `maxInputTokens` | unset | Optional cap used to shrink the per-request diff budget. |
| `requestTimeoutMs` | `120000` | Timeout for one OpenRouter request. |
| `maxRetries` | `3` | Retries for timeouts, network failures, rate limits, and transient server errors. |

Relevant environment overrides are `REVIEW_ENABLED`, `REVIEW_DRAFTS`,
`REVIEW_MAX_DIFF_CHARACTERS`, `REVIEW_MAX_FINDINGS`,
`REVIEW_MIN_CONFIDENCE`, `REVIEW_TEMPERATURE`,
`REVIEW_MAX_OUTPUT_TOKENS`, `REVIEW_MAX_INPUT_TOKENS`,
`REVIEW_REQUEST_TIMEOUT_MS`, and `REVIEW_MAX_RETRIES`. Secrets are never read
from the configuration file.

`CODE_REVIEW.md` is the repository-specific review guide. It is inserted into
the model's system prompt and is authoritative for project conventions. Keep it
focused on durable rules; it is truncated if it grows beyond 40,000 characters.

## How findings are published

The model returns JSON that is validated with Zod. Each valid finding is mapped
to a changed line in the patch:

- Findings on an added or changed line become inline review comments.
- Removed lines use the old-file line number and the `LEFT` side.
- Findings that do not land on a valid changed line appear in the review
  summary instead.
- If GitHub rejects one or more inline positions with `422`, the whole review is
  retried with no inline comments and every finding moves into the summary.

The review summary records the model, severity counts, token usage, estimated
cost when OpenRouter reports it, excluded files, filtered findings, and review
limitations. It is posted with `event: COMMENT`, never as an approval or a
request for changes.

### Duplicate suppression

Each finding has a stable fingerprint derived from the repository, pull request,
file, category, and normalized finding text. The latest successful bot review
stores the fingerprints of every finding still present.

- A finding already in that state is not posted inline again.
- A finding that disappears from the state is considered fixed. If it returns in
  a later revision, it is reported again.
- If no state marker exists, fingerprints are recovered from inline comment
  markers as a fallback.

State lives in hidden HTML comments inside the bot review body. It is not
security-sensitive and is not used for authorization.

## Security and limits

- Diff text, filenames, comments, and pull request text are untrusted prompt
  input. The system prompt tells the model to ignore embedded instructions.
- Known secret values (the GitHub token and OpenRouter key) are redacted from
  errors and published summaries.
- Committed secrets are described by type and location, never reproduced.
- Generated files, lockfiles, build output, and binary assets are excluded by
  default.
- Very large patches are split at hunk boundaries so one huge file is not
  silently dropped. Every reviewable changed line is included in exactly one
  batch.
- If a file has no patch from GitHub, or GitHub's file list is truncated, the
  summary reports that limitation.

## Failures

A review failure is visible:

1. The reviewer tries to publish a failed-review summary explaining that the
   pull request was **not** reviewed.
2. It preserves the previous state so a later successful review can still
   suppress known findings.
3. The workflow exits non-zero, so the failed job is visible in Actions.

Failures include missing configuration, invalid `.lovat-review.json`, OpenRouter
authentication or model errors, empty responses after retries, exhausted
retries, output token limits, and GitHub API errors. A missing
`OPENROUTER_API_KEY` fails before any review is published; configure the secret
and re-run the workflow.

## Local checks

Run these from `tools/pr-reviewer`:

```bash
npm ci
npm run typecheck
npm run typecheck:test
npm test
npm run build
```

The test suite covers schema validation, fingerprints, duplicate suppression,
diff mapping, configuration, OpenRouter retries and failures, GitHub pagination
and review creation, large diffs, and end-to-end review lifecycle behavior. The
CI `PR reviewer` job runs the same checks when this tool or its workflow
changes.

To exercise the reviewer locally, provide a GitHub event payload and tokens:

```bash
GITHUB_EVENT_PATH=/path/to/pr-event.json \
GITHUB_TOKEN=... \
OPENROUTER_API_KEY=... \
OPENROUTER_MODEL=anthropic/claude-sonnet-5.5 \
node dist/index.js
```

Use a disposable pull request. The command creates a real GitHub review.

## Troubleshooting

| Symptom | Check |
|---|---|
| `OPENROUTER_API_KEY is not configured` | Add the Actions secret and re-run. |
| `No OpenRouter model is configured` | Set the `OPENROUTER_MODEL` variable or `model` in `.lovat-review.json`. |
| `OpenRouter returned 401` or `403` | The API key is invalid, expired, or lacks access to the model. |
| `OpenRouter returned 404` | The model identifier is wrong or unavailable on OpenRouter. |
| `OpenRouter returned an empty response` | Empty responses are retried. If retries are exhausted, re-run later or switch models. |
| `output_limit` | Increase `maxOutputTokens` or lower `maxDiffCharacters`. |
| Review skipped as a fork | Expected. Fork pull requests do not receive secrets. |
| Review skipped as a draft | Enable `reviewDrafts`, push a commit, reopen the pull request, or mark it ready for review. |
| `422` from GitHub on a review | Inline positions were rejected; the reviewer retries with findings in the summary. |
