export const REVIEW_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
]);

export interface PullRequestEventContext {
  action: string;
  repoFullName: string;
  pullNumber: number;
  baseSha: string;
  headSha: string;
  draft: boolean;
}

export type EventEligibility =
  | { eligible: true; context: PullRequestEventContext }
  | { eligible: false; reason: string };

interface WorkflowPayload {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: {
    number?: number;
    draft?: boolean;
    state?: string;
    base?: {
      sha?: string;
      repo?: { full_name?: string };
    };
    head?: {
      sha?: string;
      repo?: { full_name?: string } | null;
    };
  };
}

/**
 * Evaluate the workflow payload before touching any API. Forked pull requests
 * are skipped because `pull_request` runs do not receive repository secrets,
 * and analysing a fork in a privileged context would expose them.
 */
export function evaluatePullRequestEvent(
  payload: unknown,
  eventName: string,
): EventEligibility {
  if (eventName !== "pull_request") {
    return {
      eligible: false,
      reason: `event ${eventName || "(unknown)"} is not a pull_request event`,
    };
  }

  if (typeof payload !== "object" || payload === null) {
    return { eligible: false, reason: "workflow payload is not an object" };
  }

  const event = payload as WorkflowPayload;
  const pullRequest = event.pull_request;

  if (!pullRequest) {
    return { eligible: false, reason: "workflow payload has no pull request" };
  }

  if (!REVIEW_ACTIONS.has(event.action ?? "")) {
    return {
      eligible: false,
      reason: `action ${event.action ?? "(unknown)"} does not require a review`,
    };
  }

  if (pullRequest.state !== undefined && pullRequest.state !== "open") {
    return {
      eligible: false,
      reason: `pull request state is ${pullRequest.state}`,
    };
  }

  const repoFullName = event.repository?.full_name;
  const pullNumber = pullRequest.number;
  const baseSha = pullRequest.base?.sha;
  const headSha = pullRequest.head?.sha;

  if (!repoFullName || !pullNumber || !baseSha || !headSha) {
    return {
      eligible: false,
      reason: "workflow payload is missing repository, pull request, or revision data",
    };
  }

  const headRepo = pullRequest.head?.repo?.full_name;
  if (headRepo === undefined || headRepo === null) {
    return {
      eligible: false,
      reason: "pull request head repository is unavailable (likely a deleted fork)",
    };
  }

  if (headRepo.toLowerCase() !== repoFullName.toLowerCase()) {
    return {
      eligible: false,
      reason:
        "pull request originates from a fork; secrets are not available to fork workflows",
    };
  }

  return {
    eligible: true,
    context: {
      action: event.action!,
      repoFullName,
      pullNumber,
      baseSha,
      headSha,
      draft: pullRequest.draft === true,
    },
  };
}
