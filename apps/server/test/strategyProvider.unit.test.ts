import { afterEach, expect, it, vi } from "vitest";
import {
  claudeStrategyProvider,
  StrategyUnavailableError,
} from "../src/lib/strategy/provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("keeps credentials on the server and uses the lightweight configured model", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "secret-test-key");
  vi.stubEnv("STRATEGY_MODEL", "test-model");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Plan" }],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await claudeStrategyProvider.draft({ teamNumber: 8033 })).toBe("Plan");
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.anthropic.com/v1/messages",
  );
  const request = fetcher.mock.calls[0][1];
  expect(request.headers["x-api-key"]).toBe("secret-test-key");
  expect(JSON.parse(request.body)).toMatchObject({
    model: "test-model",
    max_tokens: 2400,
    messages: [{ role: "user", content: '{"teamNumber":8033}' }],
  });
});
it("fails clearly when unconfigured without making a request", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(claudeStrategyProvider.draft({})).rejects.toThrow(
    "not configured",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["http", "empty", "truncated", "timeout"])(
  "sanitizes %s failures",
  async (kind) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      kind === "timeout"
        ? vi.fn().mockRejectedValue(new Error("private data"))
        : vi.fn().mockResolvedValue(
            kind === "http"
              ? new Response("private data", { status: 429 })
              : Response.json({
                  stop_reason: kind === "truncated" ? "max_tokens" : "end_turn",
                  content: [
                    { type: "text", text: kind === "empty" ? "" : "partial" },
                  ],
                }),
          ),
    );
    await expect(claudeStrategyProvider.draft({})).rejects.toBeInstanceOf(
      StrategyUnavailableError,
    );
    await expect(claudeStrategyProvider.draft({})).rejects.not.toThrow(
      "private data",
    );
  },
);
