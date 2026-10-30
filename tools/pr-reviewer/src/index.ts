import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import type { ReviewConfig } from "./config.js";
import { evaluatePullRequestEvent } from "./event.js";
import { GitHubApi } from "./github.js";
import { OpenRouterClient } from "./openrouter.js";
import { consoleLogger, runReview } from "./run.js";

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set.");
  }

  const payload = JSON.parse(await readFile(eventPath, "utf8")) as unknown;
  const eligibility = evaluatePullRequestEvent(
    payload,
    env.GITHUB_EVENT_NAME ?? "",
  );

  if (!eligibility.eligible) {
    consoleLogger.info(`Skipping AI review: ${eligibility.reason}.`);
    return 0;
  }

  const token = requireEnvironment(env, "GITHUB_TOKEN");
  const apiKey = requireEnvironment(env, "OPENROUTER_API_KEY");
  const { context } = eligibility;

  const github = new GitHubApi({
    token,
    repoFullName: context.repoFullName,
    pullNumber: context.pullNumber,
    ...(env.GITHUB_API_URL === undefined
      ? {}
      : { apiUrl: env.GITHUB_API_URL }),
  });

  const outcome = await runReview({
    repoFullName: context.repoFullName,
    pullNumber: context.pullNumber,
    baseSha: context.baseSha,
    headSha: context.headSha,
    env,
    github,
    logger: consoleLogger,
    knownSecrets: [apiKey, token],
    ...(buildRunUrl(env) === undefined ? {} : { runUrl: buildRunUrl(env) }),
    createModel: (model: string, config: ReviewConfig) =>
      new OpenRouterClient({
        apiKey,
        model,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        timeoutMs: config.requestTimeoutMs,
        maxRetries: config.maxRetries,
      }),
  });

  if (outcome.status === "skipped") {
    consoleLogger.info(`AI review skipped: ${outcome.reason}.`);
    return 0;
  }

  if (outcome.status === "failed") {
    consoleLogger.error(`AI review failed: ${outcome.error}`);
    return 1;
  }

  consoleLogger.info(
    `AI review finished in ${outcome.durationMs}ms across ${outcome.batches} batch(es).`,
  );
  return 0;
}

function requireEnvironment(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function buildRunUrl(env: NodeJS.ProcessEnv): string | undefined {
  const server = env.GITHUB_SERVER_URL;
  const repository = env.GITHUB_REPOSITORY;
  const runId = env.GITHUB_RUN_ID;

  if (!server || !repository || !runId) return undefined;
  return `${server.replace(/\/+$/, "")}/${repository}/actions/runs/${runId}`;
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      consoleLogger.error(
        `AI review could not start: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      process.exitCode = 1;
    });
}
