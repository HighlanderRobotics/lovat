import { test, expect } from "bun:test";
import { extractWithService } from "../src/ocr/service";
import template from "../config/scoreboard-2026-calgames.json";

test("service client validates its token before sending a video", async () => {
  await expect(
    extractWithService(
      "/missing",
      [],
      "Qualification 1",
      template as any,
      "http://localhost",
      "short",
    ),
  ).rejects.toThrow("Invalid OCR service configuration");
});

test("service client bounds and validates untrusted numeric responses", async () => {
  const original = globalThis.fetch;
  try {
    let result: any = {
      observations: [{ time: 6, red: 0, blue: 2, confidence: 90 }],
      layoutVersion: template.version,
      elapsedMs: 12,
      frames: 194,
    };
    globalThis.fetch = (async (_url: any, options: any) => {
      expect(options.redirect).toBe("error");
      expect(options.headers.Authorization).toBe(`Bearer ${"x".repeat(32)}`);
      return Response.json(result);
    }) as unknown as typeof fetch;
    const run = () =>
      extractWithService(
        "/missing",
        [1, 2, 3, 4, 5, 6],
        "Qualification 1",
        template as any,
        "http://localhost",
        "x".repeat(32),
      );
    expect(await run()).toEqual(result.observations);
    result = { ...result, layoutVersion: "unreviewed" };
    await expect(run()).rejects.toThrow("unknown layout");
    result = {
      ...result,
      layoutVersion: template.version,
      observations: [{ time: 6, red: -1, blue: 2, confidence: 90 }],
    };
    await expect(run()).rejects.toThrow();
    globalThis.fetch = (async () =>
      new Response("busy", { status: 503 })) as unknown as typeof fetch;
    await expect(run()).rejects.toThrow("503");
  } finally {
    globalThis.fetch = original;
  }
});
