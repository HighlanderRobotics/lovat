import { z } from "zod";

import { CATEGORIES } from "./types.js";
import type { Category, ReviewGitHub } from "./types.js";

export const DEFAULT_EXCLUDED_PATHS = [
  "node_modules/**",
  "**/node_modules/**",
  "dist/**",
  "**/dist/**",
  "build/**",
  "**/build/**",
  "coverage/**",
  "**/coverage/**",
  ".dart_tool/**",
  "**/.dart_tool/**",
  "**/*.lock",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/bun.lockb",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.snap",
  "**/generated/**",
  "**/*.g.dart",
  "**/*.freezed.dart",
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.webp",
  "**/*.ico",
  "**/*.pdf",
  "**/*.zip",
] as const;

const ConfigFileSchema = z.strictObject({
  enabled: z.boolean().default(true),
  reviewDrafts: z.boolean().default(false),
  model: z.string().min(1).max(200).optional(),
  maxDiffCharacters: z.number().int().min(1_000).max(2_000_000).default(80_000),
  maxFindings: z.number().int().min(1).max(200).default(20),
  minimumConfidence: z.number().min(0).max(1).default(0.75),
  excludedPaths: z
    .array(z.string().min(1).max(500))
    .default([...DEFAULT_EXCLUDED_PATHS]),
  categories: z
    .array(z.enum(CATEGORIES))
    .min(1)
    .default([...CATEGORIES]),
  temperature: z.number().min(0).max(2).default(0.1),
  maxOutputTokens: z.number().int().min(256).max(32_000).default(32_000),
  maxInputTokens: z.number().int().min(1_000).max(2_000_000).optional(),
  requestTimeoutMs: z.number().int().min(1_000).max(600_000).default(120_000),
  maxRetries: z.number().int().min(0).max(10).default(3),
});

export interface ReviewConfig {
  enabled: boolean;
  reviewDrafts: boolean;
  model: string;
  maxDiffCharacters: number;
  maxFindings: number;
  minimumConfidence: number;
  excludedPaths: string[];
  categories: Category[];
  temperature: number;
  maxOutputTokens: number;
  maxInputTokens?: number;
  requestTimeoutMs: number;
  maxRetries: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function parseBoolean(
  env: NodeJS.ProcessEnv,
  name: string,
): boolean | undefined {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new ConfigError(`${name} must be true or false.`);
}

function parseNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  options: { integer?: boolean; minimum?: number; maximum?: number } = {},
): number | undefined {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be a number.`);
  }

  const normalized = options.integer ? Math.trunc(value) : value;

  if (options.minimum !== undefined && normalized < options.minimum) {
    throw new ConfigError(`${name} must be at least ${options.minimum}.`);
  }

  if (options.maximum !== undefined && normalized > options.maximum) {
    throw new ConfigError(`${name} must be at most ${options.maximum}.`);
  }

  return normalized;
}

/**
 * Resolve configuration from the repository file plus supported environment
 * overrides. Secrets are intentionally not accepted here.
 */
export function resolveConfig(
  fileValue: unknown,
  env: NodeJS.ProcessEnv,
): ReviewConfig {
  const parsed = ConfigFileSchema.safeParse(fileValue);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Invalid .lovat-review.json: ${issues}`);
  }

  const overrides = {
    enabled: parseBoolean(env, "REVIEW_ENABLED"),
    reviewDrafts: parseBoolean(env, "REVIEW_DRAFTS"),
    maxDiffCharacters: parseNumber(env, "REVIEW_MAX_DIFF_CHARACTERS", {
      integer: true,
      minimum: 1_000,
      maximum: 2_000_000,
    }),
    maxFindings: parseNumber(env, "REVIEW_MAX_FINDINGS", {
      integer: true,
      minimum: 1,
      maximum: 200,
    }),
    minimumConfidence: parseNumber(env, "REVIEW_MIN_CONFIDENCE", {
      minimum: 0,
      maximum: 1,
    }),
    temperature: parseNumber(env, "REVIEW_TEMPERATURE", {
      minimum: 0,
      maximum: 2,
    }),
    maxOutputTokens: parseNumber(env, "REVIEW_MAX_OUTPUT_TOKENS", {
      integer: true,
      minimum: 256,
      maximum: 32_000,
    }),
    maxInputTokens: parseNumber(env, "REVIEW_MAX_INPUT_TOKENS", {
      integer: true,
      minimum: 1_000,
      maximum: 2_000_000,
    }),
    requestTimeoutMs: parseNumber(env, "REVIEW_REQUEST_TIMEOUT_MS", {
      integer: true,
      minimum: 1_000,
      maximum: 600_000,
    }),
    maxRetries: parseNumber(env, "REVIEW_MAX_RETRIES", {
      integer: true,
      minimum: 0,
      maximum: 10,
    }),
  };

  const model =
    env.OPENROUTER_MODEL?.trim() || parsed.data.model?.trim() || undefined;

  if (!model) {
    throw new ConfigError(
      "No OpenRouter model is configured. Set the OPENROUTER_MODEL repository variable or add model to .lovat-review.json.",
    );
  }

  return {
    enabled: overrides.enabled ?? parsed.data.enabled,
    reviewDrafts: overrides.reviewDrafts ?? parsed.data.reviewDrafts,
    model,
    maxDiffCharacters:
      overrides.maxDiffCharacters ?? parsed.data.maxDiffCharacters,
    maxFindings: overrides.maxFindings ?? parsed.data.maxFindings,
    minimumConfidence:
      overrides.minimumConfidence ?? parsed.data.minimumConfidence,
    excludedPaths: parsed.data.excludedPaths,
    categories: parsed.data.categories,
    temperature: overrides.temperature ?? parsed.data.temperature,
    maxOutputTokens:
      overrides.maxOutputTokens ?? parsed.data.maxOutputTokens,
    ...(overrides.maxInputTokens === undefined &&
    parsed.data.maxInputTokens === undefined
      ? {}
      : {
          maxInputTokens:
            overrides.maxInputTokens ?? parsed.data.maxInputTokens,
        }),
    requestTimeoutMs:
      overrides.requestTimeoutMs ?? parsed.data.requestTimeoutMs,
    maxRetries: overrides.maxRetries ?? parsed.data.maxRetries,
  };
}

export async function loadConfig(
  github: ReviewGitHub,
  ref: string,
  env: NodeJS.ProcessEnv,
): Promise<ReviewConfig> {
  const content = await github.getFileAtRef(".lovat-review.json", ref);

  if (content === null) {
    return resolveConfig({}, env);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new ConfigError(".lovat-review.json is not valid JSON.");
  }

  return resolveConfig(parsed, env);
}

export interface ReviewGuide {
  text: string;
  truncated: boolean;
}

export async function loadReviewGuide(
  github: ReviewGitHub,
  ref: string,
): Promise<ReviewGuide> {
  const content = await github.getFileAtRef("CODE_REVIEW.md", ref);

  if (content === null) {
    return { text: "", truncated: false };
  }

  const maximum = 40_000;
  return {
    text:
      content.length > maximum
        ? `${content.slice(0, maximum)}\n\n[Review guide truncated at ${maximum} characters.]`
        : content,
    truncated: content.length > maximum,
  };
}
