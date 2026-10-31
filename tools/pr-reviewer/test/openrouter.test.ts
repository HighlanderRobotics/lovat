import { describe, expect, it } from "vitest";

import {
  OpenRouterClient,
  OpenRouterError,
  parseRetryAfter,
} from "../src/openrouter.js";
import { jsonResponse, modelResponse, noSleep, scriptedFetch, textResponse } from "./helpers.js";

function completion(
  content: string,
  options: {
    finishReason?: string;
    usage?: Record<string, unknown>;
  } = {},
): Response {
  return jsonResponse({
    choices: [
      {
        finish_reason: options.finishReason ?? "stop",
        message: { content },
      },
    ],
    usage: options.usage ?? {
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
    },
  });
}

function client(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof OpenRouterClient>[0]> = {},
): OpenRouterClient {
  return new OpenRouterClient({
    apiKey: "sk-or-v1-test-key",
    model: "test/model",
    temperature: 0.1,
    maxOutputTokens: 2_000,
    timeoutMs: 5_000,
    maxRetries: 2,
    fetchImpl,
    random: () => 0.5,
    ...overrides,
  });
}

describe("OpenRouterClient", () => {
  it("sends structured review requests and parses usage", async () => {
    const { fetchImpl, calls } = scriptedFetch([completion(modelResponse([]))]);
    const result = await client(fetchImpl).review({
      systemPrompt: "system",
      userPrompt: "user",
      batchIndex: 0,
      batchCount: 1,
    });

    expect(result.content).toContain('"findings":[]');
    expect(result.usage).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    });
    expect(result.usedJsonSchema).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-v1-test-key");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("test/model");
    expect(body.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "user" },
    ]);
    expect(body.temperature).toBe(0.1);
    expect(body.max_tokens).toBe(2_000);
    expect(body.response_format).toMatchObject({ type: "json_schema" });
  });

  it("retries transient failures with exponential backoff", async () => {
    const { sleep, delays } = noSleep();
    const { fetchImpl, calls } = scriptedFetch([
      textResponse("temporary", { status: 503 }),
      completion(modelResponse([])),
    ]);

    await client(fetchImpl, { maxRetries: 1, sleep }).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    expect(calls).toHaveLength(2);
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThan(0);
  });

  it("honors Retry-After on rate limits", async () => {
    const { sleep, delays } = noSleep();
    const { fetchImpl } = scriptedFetch([
      textResponse("rate limited", {
        status: 429,
        headers: { "retry-after": "2" },
      }),
      completion(modelResponse([])),
    ]);

    await client(fetchImpl, { maxRetries: 1, sleep }).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    expect(delays).toEqual([2_000]);
  });

  it("does not retry authentication failures", async () => {
    const { sleep } = noSleep();
    const { fetchImpl, calls } = scriptedFetch([
      textResponse("unauthorized", { status: 401 }),
    ]);

    const review = client(fetchImpl, { sleep }).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    await expect(review).rejects.toMatchObject({
      status: 401,
      retryable: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("falls back when the provider rejects structured output", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      textResponse("response_format is not supported", { status: 400 }),
      completion(modelResponse([])),
    ]);

    const result = await client(fetchImpl).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    expect(result.usedJsonSchema).toBe(false);
    expect(calls).toHaveLength(2);
    const body = JSON.parse(String(calls[1]!.init.body)) as Record<string, unknown>;
    expect(body.response_format).toBeUndefined();
  });

  it("retries empty responses before succeeding", async () => {
    const { sleep, delays } = noSleep();
    const { fetchImpl, calls } = scriptedFetch([
      completion(""),
      completion(modelResponse([])),
    ]);

    const result = await client(fetchImpl, { maxRetries: 1, sleep }).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    expect(result.content).toContain('"findings":[]');
    expect(calls).toHaveLength(2);
    expect(delays).toHaveLength(1);
  });

  it("rejects empty responses after retries are exhausted", async () => {
    const { sleep } = noSleep();
    const { fetchImpl, calls } = scriptedFetch([
      completion(""),
      completion(""),
    ]);

    await expect(
      client(fetchImpl, { maxRetries: 1, sleep }).review({
        systemPrompt: "s",
        userPrompt: "u",
        batchIndex: 0,
        batchCount: 1,
      }),
    ).rejects.toMatchObject({ code: "empty_response", retryable: true });
    expect(calls).toHaveLength(2);
  });

  it("logs empty-response metadata without logging response content", async () => {
    const { sleep } = noSleep();
    const logs: string[] = [];
    const logger = {
      info: (message: string) => logs.push(`info:${message}`),
      warn: (message: string) => logs.push(`warn:${message}`),
      error: (message: string) => logs.push(`error:${message}`),
    };
    const { fetchImpl } = scriptedFetch([
      jsonResponse({
        choices: [
          {
            finish_reason: "length",
            native_finish_reason: "max_tokens",
            message: { content: "", reasoning: "internal reasoning" },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 4_096,
          total_tokens: 4_196,
          completion_tokens_details: { reasoning_tokens: 4_096 },
        },
      }),
      completion(modelResponse([])),
    ]);

    await client(fetchImpl, { maxRetries: 1, sleep, logger }).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    const output = logs.join("\n");
    expect(output).toContain("finish_reason=length");
    expect(output).toContain("native_finish_reason=max_tokens");
    expect(output).toContain("content_chars=0");
    expect(output).toContain("reasoning_chars=18");
    expect(output).toContain("reasoning_tokens=4096");
    expect(output).toContain("OpenRouter retrying in");
    expect(output).not.toContain("internal reasoning");
  });

  it("rejects output-limit truncation without retrying", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      completion(modelResponse([]), { finishReason: "length" }),
    ]);

    await expect(
      client(fetchImpl).review({
        systemPrompt: "s",
        userPrompt: "u",
        batchIndex: 0,
        batchCount: 1,
      }),
    ).rejects.toMatchObject({ code: "output_limit" });
    expect(calls).toHaveLength(1);
  });

  it("handles error payloads returned with HTTP 200", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      jsonResponse({ error: { message: "overloaded", code: 503 } }),
      completion(modelResponse([])),
    ]);

    const result = await client(fetchImpl).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    expect(result.content).toContain('"findings":[]');
    expect(calls).toHaveLength(2);
  });

  it("rejects malformed payloads and exhausted network retries", async () => {
    const malformed = scriptedFetch([
      textResponse("not json", { status: 200 }),
    ]);
    await expect(
      client(malformed.fetchImpl).review({
        systemPrompt: "s",
        userPrompt: "u",
        batchIndex: 0,
        batchCount: 1,
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });

    const { sleep } = noSleep();
    let calls = 0;
    const failingFetch = (async () => {
      calls += 1;
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      client(failingFetch, { maxRetries: 2, sleep }).review({
        systemPrompt: "s",
        userPrompt: "u",
        batchIndex: 0,
        batchCount: 1,
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
    expect(calls).toBe(3);
  });

  it("reports timeouts distinctly", async () => {
    const { sleep } = noSleep();
    const timeoutFetch = (async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    }) as unknown as typeof fetch;

    await expect(
      client(timeoutFetch, { maxRetries: 0, sleep }).review({
        systemPrompt: "s",
        userPrompt: "u",
        batchIndex: 0,
        batchCount: 1,
      }),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("records cost usage when OpenRouter provides it", async () => {
    const { fetchImpl } = scriptedFetch([
      completion(modelResponse([]), {
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          cost: 0.0012,
        },
      }),
    ]);

    const result = await client(fetchImpl).review({
      systemPrompt: "s",
      userPrompt: "u",
      batchIndex: 0,
      batchCount: 1,
    });

    expect(result.usage.costUsd).toBe(0.0012);
  });
});

describe("parseRetryAfter", () => {
  it("accepts seconds, HTTP dates, and invalid values", () => {
    expect(parseRetryAfter("3")).toBe(3_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("not a date")).toBeUndefined();
    expect(parseRetryAfter(new Date(Date.now() + 10_000).toUTCString())).toBeGreaterThan(
      0,
    );
  });
});
