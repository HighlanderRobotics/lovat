import { describe, expect, it } from "vitest";

import {
  ConfigError,
  DEFAULT_EXCLUDED_PATHS,
  loadConfig,
  loadReviewGuide,
  resolveConfig,
} from "../src/config.js";
import { CATEGORIES } from "../src/types.js";
import { FakeGitHub } from "./helpers.js";

describe("resolveConfig", () => {
  it("applies defaults when the file is empty", () => {
    const config = resolveConfig({}, {
      OPENROUTER_MODEL: "test/model",
    });

    expect(config.enabled).toBe(true);
    expect(config.reviewDrafts).toBe(false);
    expect(config.model).toBe("test/model");
    expect(config.maxDiffCharacters).toBe(80_000);
    expect(config.maxFindings).toBe(20);
    expect(config.minimumConfidence).toBe(0.75);
    expect(config.categories).toEqual([...CATEGORIES]);
    expect(config.excludedPaths).toEqual([...DEFAULT_EXCLUDED_PATHS]);
  });

  it("reads repository configuration and lets environment variables override it", () => {
    const config = resolveConfig(
      {
        enabled: false,
        model: "file/model",
        maxDiffCharacters: 10_000,
        maxFindings: 5,
        minimumConfidence: 0.5,
        categories: ["BUG", "SECURITY"],
        excludedPaths: ["docs/**"],
      },
      {
        OPENROUTER_MODEL: "env/model",
        REVIEW_ENABLED: "true",
        REVIEW_MAX_DIFF_CHARACTERS: "20000",
        REVIEW_MAX_FINDINGS: "9",
        REVIEW_MIN_CONFIDENCE: "0.9",
        REVIEW_TEMPERATURE: "0",
        REVIEW_MAX_OUTPUT_TOKENS: "2048",
        REVIEW_MAX_INPUT_TOKENS: "50000",
        REVIEW_REQUEST_TIMEOUT_MS: "45000",
        REVIEW_MAX_RETRIES: "1",
      },
    );

    expect(config.enabled).toBe(true);
    expect(config.model).toBe("env/model");
    expect(config.maxDiffCharacters).toBe(20_000);
    expect(config.maxFindings).toBe(9);
    expect(config.minimumConfidence).toBe(0.9);
    expect(config.temperature).toBe(0);
    expect(config.maxOutputTokens).toBe(2_048);
    expect(config.maxInputTokens).toBe(50_000);
    expect(config.requestTimeoutMs).toBe(45_000);
    expect(config.maxRetries).toBe(1);
    expect(config.categories).toEqual(["BUG", "SECURITY"]);
    expect(config.excludedPaths).toEqual(["docs/**"]);
  });

  it("requires a model from either the environment or the file", () => {
    expect(() => resolveConfig({}, {})).toThrow(ConfigError);
  });

  it("rejects unknown configuration keys", () => {
    expect(() =>
      resolveConfig({ maxDiffCharacter: 10_000 }, { OPENROUTER_MODEL: "m" }),
    ).toThrow(/Invalid \.lovat-review\.json/);
  });

  it("rejects invalid overrides", () => {
    expect(() =>
      resolveConfig({}, { OPENROUTER_MODEL: "m", REVIEW_MIN_CONFIDENCE: "2" }),
    ).toThrow(/REVIEW_MIN_CONFIDENCE/);

    expect(() =>
      resolveConfig({}, { OPENROUTER_MODEL: "m", REVIEW_ENABLED: "sometimes" }),
    ).toThrow(/REVIEW_ENABLED/);
  });
});

describe("loadConfig", () => {
  it("returns defaults when the configuration file is absent", async () => {
    const github = new FakeGitHub();
    const config = await loadConfig(github, "base-sha", {
      OPENROUTER_MODEL: "test/model",
    });
    expect(config.model).toBe("test/model");
  });

  it("parses the configuration from the base revision", async () => {
    const github = new FakeGitHub({
      contents: {
        ".lovat-review.json": JSON.stringify({ maxFindings: 3, model: "file/model" }),
      },
    });

    const config = await loadConfig(github, "base-sha", {});
    expect(config.model).toBe("file/model");
    expect(config.maxFindings).toBe(3);
  });

  it("fails clearly when the configuration file is invalid", async () => {
    const github = new FakeGitHub({
      contents: { ".lovat-review.json": "{not json" },
    });

    await expect(loadConfig(github, "base-sha", {})).rejects.toThrow(
      /not valid JSON/,
    );
  });
});

describe("loadReviewGuide", () => {
  it("returns an empty guide when CODE_REVIEW.md is absent", async () => {
    const github = new FakeGitHub();
    await expect(loadReviewGuide(github, "base-sha")).resolves.toEqual({
      text: "",
      truncated: false,
    });
  });

  it("loads and truncates a large guide", async () => {
    const github = new FakeGitHub({
      contents: { "CODE_REVIEW.md": "x".repeat(40_010) },
    });

    const guide = await loadReviewGuide(github, "base-sha");
    expect(guide.truncated).toBe(true);
    expect(guide.text.length).toBeLessThan(40_100);
    expect(guide.text).toContain("truncated");
  });
});
