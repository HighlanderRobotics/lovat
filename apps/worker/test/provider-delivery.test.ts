import { expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { createOutboxDelivery } from "../src/outbox";

test("email transport preserves idempotency across retries and sanitizes provider errors", async () => {
  const calls: { key: string | null; body: unknown }[] = [];
  const delivery = createOutboxDelivery({} as PrismaClient, {
    redisUrl: "redis://127.0.0.1:6379",
    prefix: "lovat:provider-fixture:",
    resendKey: "synthetic-key",
    emailFrom: "fixture@example.invalid",
    fetcher: (async (url, init) => {
      expect(String(url)).toBe("https://api.resend.com/emails");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer synthetic-key",
      );
      calls.push({
        key: new Headers(init?.headers).get("idempotency-key"),
        body: JSON.parse(String(init?.body)),
      });
      return calls.length === 1
        ? new Response("private-provider-detail", { status: 503 })
        : Response.json({ id: "fixture" });
    }) as typeof fetch,
  });
  const effect = {
    kind: "email.send" as const,
    to: "recipient@example.invalid",
    subject: "Synthetic",
    text: "Synthetic content",
  };
  try {
    await expect(delivery.deliver(effect, "stable-fixture-id")).rejects.toThrow(
      "Email delivery failed",
    );
    await delivery.deliver(effect, "stable-fixture-id");
    expect(calls.map((call) => call.key)).toEqual([
      "stable-fixture-id",
      "stable-fixture-id",
    ]);
    expect(calls[1]?.body).toEqual({
      from: "fixture@example.invalid",
      to: ["recipient@example.invalid"],
      subject: "Synthetic",
      text: "Synthetic content",
    });
  } finally {
    delivery.close();
  }
});
test("Slack delivery validates success and rechecks workspace access on retry", async () => {
  let calls = 0,
    removed = false;
  const db = {
    slackWorkspace: {
      findUnique: async () =>
        removed ? null : { authToken: "synthetic-token" },
    },
  } as unknown as PrismaClient;
  const delivery = createOutboxDelivery(db, {
    redisUrl: "redis://127.0.0.1:6379",
    prefix: "lovat:provider-fixture:",
    fetcher: (async (url, init) => {
      expect(String(url)).toBe("https://slack.com/api/chat.postMessage");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer synthetic-token",
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        channel: "fixture-channel",
        text: "Synthetic",
        client_msg_id: "stable-slack-id",
      });
      calls++;
      return Response.json(
        calls === 1
          ? { ok: false, error: "private-provider-detail" }
          : { ok: true, ts: "1.0" },
      );
    }) as typeof fetch,
  });
  const effect = {
    kind: "slack.message" as const,
    workspaceId: "fixture-workspace",
    channelId: "fixture-channel",
    text: "Synthetic",
  };
  try {
    await expect(delivery.deliver(effect, "stable-slack-id")).rejects.toThrow(
      "Slack delivery failed",
    );
    await delivery.deliver(effect, "stable-slack-id");
    removed = true;
    await delivery.deliver(effect, "stable-slack-id");
    expect(calls).toBe(2);
  } finally {
    delivery.close();
  }
});
