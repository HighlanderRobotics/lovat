import { describe, expect, it } from "vitest";

import { evaluatePullRequestEvent } from "../src/event.js";

function payload(overrides: Record<string, unknown> = {}): unknown {
  return {
    action: "opened",
    repository: { full_name: "HighlanderRobotics/lovat" },
    pull_request: {
      number: 12,
      draft: false,
      state: "open",
      base: { sha: "base", repo: { full_name: "HighlanderRobotics/lovat" } },
      head: { sha: "head", repo: { full_name: "HighlanderRobotics/lovat" } },
      ...overrides,
    },
  };
}

describe("evaluatePullRequestEvent", () => {
  it("accepts opened, synchronize, reopened, and ready_for_review events from the same repository", () => {
    for (const action of [
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
    ]) {
      const event = { ...(payload() as Record<string, unknown>), action };
      const result = evaluatePullRequestEvent(event, "pull_request");
      expect(result.eligible).toBe(true);
    }
  });

  it("rejects title and description edits", () => {
    const event = payload();
    (event as { action: string }).action = "edited";
    const result = evaluatePullRequestEvent(event, "pull_request");
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/does not require/);
  });

  it("rejects forked pull requests so secrets are never exposed", () => {
    const event = payload({
      head: { sha: "head", repo: { full_name: "someone/lovat" } },
    });
    const result = evaluatePullRequestEvent(event, "pull_request");
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/fork/);
  });

  it("rejects deleted fork heads", () => {
    const event = payload({ head: { sha: "head", repo: null } });
    const result = evaluatePullRequestEvent(event, "pull_request");
    expect(result.eligible).toBe(false);
  });

  it("rejects non-pull_request events and incomplete payloads", () => {
    expect(evaluatePullRequestEvent(payload(), "push").eligible).toBe(false);
    expect(evaluatePullRequestEvent(null, "pull_request").eligible).toBe(false);
    expect(evaluatePullRequestEvent({ action: "opened" }, "pull_request").eligible).toBe(
      false,
    );
  });

  it("exposes draft status for later configuration checks", () => {
    const event = payload({ draft: true });
    const result = evaluatePullRequestEvent(event, "pull_request");
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.context.draft).toBe(true);
  });
});
