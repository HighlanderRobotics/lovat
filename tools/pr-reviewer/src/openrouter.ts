import { redactSecrets } from "./redact.js";
import { reviewResponseJsonSchema } from "./response.js";
import type {
  Logger,
  ModelReviewRequest,
  ModelReviewResult,
  ModelUsage,
  ReviewerModel,
} from "./types.js";

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  apiUrl?: string;
  appUrl?: string;
  appTitle?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  logger?: Logger;
}

export class OpenRouterError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly code: string;

  constructor(
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      code?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "OpenRouterError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.code = options.code ?? "openrouter_error";
  }
}

interface ChatCompletionPayload {
  id?: string;
  model?: string;
  provider?: string;
  choices?: Array<{
    finish_reason?: string;
    native_finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      reasoning?: string;
      refusal?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: {
    message?: string;
    code?: number | string;
  };
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class OpenRouterClient implements ReviewerModel {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly logger: Logger;

  constructor(private readonly options: OpenRouterOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.logger =
      options.logger ??
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      };
  }

  async review(request: ModelReviewRequest): Promise<ModelReviewResult> {
    const startedAt = this.now();
    let useJsonSchema = true;
    let schemaFallbackUsed = false;
    let attempts = 0;
    const requestLabel = `batch ${request.batchIndex + 1}/${request.batchCount}`;

    while (true) {
      attempts += 1;
      const attemptStartedAt = this.now();
      const attemptLabel = `${requestLabel} attempt ${attempts}/${this.options.maxRetries + 1}`;

      this.logger.info(
        `OpenRouter request starting: ${attemptLabel}, model=${this.options.model}, prompt_chars=${request.systemPrompt.length + request.userPrompt.length}, max_output_tokens=${this.options.maxOutputTokens}, structured_output=${useJsonSchema}.`,
      );

      let response: Response;
      try {
        response = await this.fetchImpl(this.options.apiUrl ?? "https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              this.options.appUrl ?? "https://github.com/HighlanderRobotics/lovat",
            "X-Title": this.options.appTitle ?? "Lovat AI PR Reviewer",
          },
          body: JSON.stringify(this.buildBody(request, useJsonSchema)),
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
      } catch (error) {
        const timedOut = isAbortError(error);
        const wrapped = new OpenRouterError(
          timedOut
            ? `OpenRouter request timed out after ${this.options.timeoutMs}ms.`
            : "OpenRouter request failed before a response was received.",
          { retryable: true, code: timedOut ? "timeout" : "network", cause: error },
        );

        this.logger.warn(
          `OpenRouter request failed: ${attemptLabel} after ${this.now() - attemptStartedAt}ms (${wrapped.code}).`,
        );

        if (attempts > this.options.maxRetries) throw wrapped;
        await this.waitBeforeRetry(
          attempts - 1,
          `${attemptLabel} failed with ${wrapped.code}`,
        );
        continue;
      }

      const responseText = await response.text();

      if (
        response.status === 400 &&
        useJsonSchema &&
        !schemaFallbackUsed &&
        /response_format|json_schema|structured/i.test(responseText)
      ) {
        // Some OpenRouter providers reject structured-output parameters. Retry
        // once without them and rely on the prompt plus Zod validation.
        useJsonSchema = false;
        schemaFallbackUsed = true;
        attempts -= 1;
        this.logger.warn(
          `OpenRouter rejected structured output for ${requestLabel}; retrying once without response_format.`,
        );
        continue;
      }

      if (!response.ok) {
        const message = extractErrorMessage(responseText) ?? `HTTP ${response.status}`;
        const retryable = RETRYABLE_STATUS.has(response.status);
        const error = new OpenRouterError(
          `OpenRouter returned ${response.status}: ${message}`,
          {
            status: response.status,
            retryable,
            code: retryable ? "transient" : "request_rejected",
          },
        );

        this.logger.warn(
          `OpenRouter response rejected: ${attemptLabel} HTTP ${response.status}, retryable=${retryable}, body_chars=${responseText.length}, provider_message=${redactProviderMessage(message, this.options.apiKey)}.`,
        );

        if (retryable && attempts <= this.options.maxRetries) {
          await this.waitBeforeRetry(
            attempts - 1,
            `${attemptLabel} returned HTTP ${response.status}`,
            response.headers.get("retry-after"),
          );
          continue;
        }

        throw error;
      }

      let payload: ChatCompletionPayload;
      try {
        payload = this.parsePayload(responseText);
      } catch (error) {
        this.logger.error(
          `OpenRouter response was not valid JSON: ${attemptLabel} HTTP ${response.status}, body_chars=${responseText.length}.`,
        );
        throw error;
      }

      if (payload.error) {
        const code = payload.error.code;
        const retryable =
          code === 429 ||
          (typeof code === "number" && code >= 500) ||
          /rate limit|temporar|timeout|overload/i.test(payload.error.message ?? "");
        const error = new OpenRouterError(
          `OpenRouter error: ${payload.error.message ?? "unknown error"}`,
          {
            retryable,
            code: retryable ? "transient" : "request_rejected",
          },
        );

        this.logger.warn(
          `OpenRouter error payload: ${attemptLabel} code=${code ?? "none"}, retryable=${retryable}, provider_message=${redactProviderMessage(payload.error.message ?? "", this.options.apiKey)}.`,
        );

        if (retryable && attempts <= this.options.maxRetries) {
          await this.waitBeforeRetry(
            attempts - 1,
            `${attemptLabel} returned an error payload`,
          );
          continue;
        }

        throw error;
      }

      const choice = payload.choices?.[0];
      const content = extractContent(choice?.message?.content);
      const responseDetails = describeResponse(
        payload,
        choice,
        content,
        responseText.length,
      );

      if (content === null || content.trim().length === 0) {
        const error = new OpenRouterError("OpenRouter returned an empty response.", {
          retryable: true,
          code: "empty_response",
        });

        this.logger.warn(
          `OpenRouter returned an empty response: ${attemptLabel} ${responseDetails}.`,
        );

        if (attempts <= this.options.maxRetries) {
          await this.waitBeforeRetry(
            attempts - 1,
            `${attemptLabel} returned an empty response`,
          );
          continue;
        }

        throw error;
      }

      if (choice?.finish_reason === "length") {
        this.logger.error(
          `OpenRouter output was truncated: ${attemptLabel} ${responseDetails}.`,
        );
        throw new OpenRouterError(
          "OpenRouter stopped because the output token limit was reached. Increase maxOutputTokens or reduce the review batch size.",
          { code: "output_limit" },
        );
      }

      this.logger.info(
        `OpenRouter response received: ${attemptLabel} in ${this.now() - attemptStartedAt}ms, ${responseDetails}, structured_output=${useJsonSchema}.`,
      );

      return {
        content,
        usage: extractUsage(payload.usage),
        ...(choice?.finish_reason === undefined
          ? {}
          : { finishReason: choice.finish_reason }),
        usedJsonSchema: useJsonSchema,
        durationMs: this.now() - startedAt,
      };
    }
  }

  private buildBody(request: ModelReviewRequest, useJsonSchema: boolean): unknown {
    return {
      model: this.options.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      temperature: this.options.temperature,
      max_tokens: this.options.maxOutputTokens,
      stream: false,
      usage: { include: true },
      ...(useJsonSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "lovat_review",
                strict: true,
                schema: reviewResponseJsonSchema,
              },
            },
          }
        : {}),
    };
  }

  private parsePayload(responseText: string): ChatCompletionPayload {
    try {
      const parsed = JSON.parse(responseText) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("not an object");
      }
      return parsed as ChatCompletionPayload;
    } catch {
      throw new OpenRouterError(
        "OpenRouter returned a response that was not valid JSON.",
        { code: "invalid_response" },
      );
    }
  }

  private async waitBeforeRetry(
    attempt: number,
    reason: string,
    retryAfterHeader?: string | null,
  ): Promise<void> {
    const retryAfter = parseRetryAfter(retryAfterHeader);
    const exponential = Math.min(30_000, 1_000 * 2 ** attempt);
    const jitter = retryAfter === undefined ? 0.5 + this.random() * 0.5 : 1;
    const delay = Math.min(60_000, Math.round((retryAfter ?? exponential) * jitter));
    this.logger.warn(`OpenRouter retrying in ${delay}ms: ${reason}.`);
    await this.sleep(delay);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

type ChatCompletionChoice = NonNullable<ChatCompletionPayload["choices"]>[number];

function describeResponse(
  payload: ChatCompletionPayload,
  choice: ChatCompletionChoice | undefined,
  content: string | null,
  responseCharacters: number,
): string {
  const rawContent = choice?.message?.content;
  const contentKind =
    typeof rawContent === "string"
      ? "string"
      : Array.isArray(rawContent)
        ? "array"
        : "missing";
  const reasoningCharacters =
    typeof choice?.message?.reasoning === "string"
      ? choice.message.reasoning.length
      : 0;
  const messageKeys = Object.keys(choice?.message ?? {}).sort().join(",");

  return [
    `http_body_chars=${responseCharacters}`,
    `choices=${payload.choices?.length ?? 0}`,
    `response_model=${payload.model ?? "unknown"}`,
    `finish_reason=${choice?.finish_reason ?? "none"}`,
    `native_finish_reason=${choice?.native_finish_reason ?? "none"}`,
    `content_kind=${contentKind}`,
    `content_chars=${content?.length ?? 0}`,
    `reasoning_chars=${reasoningCharacters}`,
    `message_keys=${messageKeys || "none"}`,
    `prompt_tokens=${payload.usage?.prompt_tokens ?? 0}`,
    `completion_tokens=${payload.usage?.completion_tokens ?? 0}`,
    `reasoning_tokens=${payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0}`,
  ].join(", ");
}

function redactProviderMessage(message: string, apiKey: string): string {
  return redactSecrets(message, [apiKey]).replace(/\s+/g, " ").slice(0, 300);
}

export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim() === "") {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.round(seconds * 1_000));
  }

  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.min(60_000, Math.max(0, date - Date.now()));
  }

  return undefined;
}

function extractErrorMessage(responseText: string): string | undefined {
  try {
    const parsed = JSON.parse(responseText) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message ?? parsed.message;
  } catch {
    return responseText.trim().slice(0, 300) || undefined;
  }
}

function extractContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join("\n") : null;
  }
  return null;
}

function extractUsage(usage: ChatCompletionPayload["usage"]): ModelUsage {
  const promptTokens = numberOrZero(usage?.prompt_tokens);
  const completionTokens = numberOrZero(usage?.completion_tokens);
  const totalTokens =
    usage?.total_tokens === undefined
      ? promptTokens + completionTokens
      : numberOrZero(usage.total_tokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    ...(typeof usage?.cost === "number" && Number.isFinite(usage.cost)
      ? { costUsd: usage.cost }
      : {}),
  };
}

function numberOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
