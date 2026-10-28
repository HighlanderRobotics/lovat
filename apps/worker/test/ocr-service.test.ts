import { test, expect } from "bun:test";
import {
  OcrServiceUnavailable,
  extractWithService,
  extractServiceEvidence,
} from "../src/ocr/service";
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
    await expect(run()).rejects.toBeInstanceOf(OcrServiceUnavailable);
    globalThis.fetch = (async () => {
      throw new Error("network unavailable");
    }) as unknown as typeof fetch;
    await expect(run()).rejects.toBeInstanceOf(OcrServiceUnavailable);
  } finally {
    globalThis.fetch = original;
  }
});

test("a transient service failure leaves the match eligible for scheduler retry", async () => {
  const { scanScoreboardTournament } =
    await import("../src/jobs/scoreboard-ocr");
  const previous = process.env.OCR_SCOREBOARD_TEMPLATE;
  process.env.OCR_SCOREBOARD_TEMPLATE = JSON.stringify(template);
  let saved = false;
  try {
    await expect(
      scanScoreboardTournament("2026cacg", {
        db: {
          tournament: {
            findFirst: async () => ({
              matches: [
                {
                  key: "2026cacg_qm1",
                  competitionLevel: "QUALIFICATION",
                  matchNumber: 1,
                  scoreboardOcr: null,
                  teamSlots: [1, 2, 3, 4, 5, 6].map((teamNumber) => ({
                    teamNumber,
                  })),
                },
              ],
            }),
          },
          scoreboardOcr: {
            upsert: async () => {
              saved = true;
            },
          },
        } as any,
        tba: {
          get: async () => ({
            modified: true,
            data: { videos: [{ type: "youtube", key: "aaaaaaaaaaa" }] },
          }),
        } as any,
        extract: async () => {
          throw new OcrServiceUnavailable("processor busy");
        },
      }),
    ).rejects.toBeInstanceOf(OcrServiceUnavailable);
    expect(saved).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.OCR_SCOREBOARD_TEMPLATE;
    else process.env.OCR_SCOREBOARD_TEMPLATE = previous;
  }
});

test("service contract retains independently confident total-score digits", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      Response.json({
        observations: [
          {
            time: 7,
            red: 5,
            blue: 4,
            confidence: 95,
            redPoints: 10,
            bluePoints: 4,
            pointsConfidence: 96,
          },
        ],
        layoutVersion: template.version,
        elapsedMs: 1,
        frames: 100,
      })) as unknown as typeof fetch;
    const result = await extractWithService(
      "/missing",
      [1, 2, 3, 4, 5, 6],
      "Qualification 1",
      template as any,
      "http://localhost",
      "x".repeat(32),
    );
    expect(result[0]).toMatchObject({
      redPoints: 10,
      bluePoints: 4,
      pointsConfidence: 96,
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("native rejection reasons are allowlisted and bounded", async () => {
  const original = globalThis.fetch;
  const run = () =>
    extractWithService(
      "/missing",
      [1, 2, 3, 4, 5, 6],
      "Qualification 1",
      template as any,
      "http://localhost",
      "x".repeat(32),
    );
  try {
    globalThis.fetch = (async () =>
      new Response("IDENTITY_UNVERIFIED", { status: 422 })) as any;
    await expect(run()).rejects.toThrow("IDENTITY_UNVERIFIED");
    globalThis.fetch = (async () =>
      new Response("private backend diagnostics", { status: 422 })) as any;
    await expect(run()).rejects.toThrow("EXTRACTION_FAILED");
    globalThis.fetch = (async () =>
      new Response("x".repeat(1024), { status: 422 })) as any;
    await expect(run()).rejects.toThrow("Oversized OCR service response");
  } finally {
    globalThis.fetch = original;
  }
});

test("native channel evidence survives the client while paired callers remain compatible", async () => {
  const original = globalThis.fetch;
  const channels = { red: [{ time: 6, count: 2, confidence: 95 }], blue: [] };
  const result = {
    observations: [],
    channels,
    layoutVersion: template.version,
    elapsedMs: 1,
    frames: 10,
  };
  const args: Parameters<typeof extractServiceEvidence> = [
    "/missing",
    [1, 2, 3, 4, 5, 6],
    "Qualification 1",
    template as any,
    "http://localhost",
    "x".repeat(32),
  ];
  try {
    globalThis.fetch = (async () => Response.json(result)) as any;
    expect((await extractServiceEvidence(...args)).channels).toEqual(channels);
    expect(await extractWithService(...args)).toEqual([]);
    channels.red[0]!.confidence = 84;
    await expect(extractServiceEvidence(...args)).rejects.toThrow();
    globalThis.fetch = (async () =>
      new Response("x".repeat(256 * 1024 + 1))) as any;
    await expect(extractServiceEvidence(...args)).rejects.toThrow(
      "Oversized OCR service response",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("optional native profiles are validated without breaking older service results", async () => {
  const original = globalThis.fetch;
  const profile = {
    probeMs: 1,
    decoderReadWaitMs: 2,
    identityMs: 3,
    clockMs: 4,
    counterMs: 5,
    recognitionMs: 6,
    recognitionCalls: 7,
    cacheHits: 8,
  };
  const result: any = {
    observations: [],
    layoutVersion: template.version,
    elapsedMs: 10,
    frames: 1,
    profile,
  };
  const run = () =>
    extractServiceEvidence(
      "/missing",
      [1, 2, 3, 4, 5, 6],
      "Qualification 1",
      template as any,
      "http://localhost",
      "x".repeat(32),
    );
  try {
    globalThis.fetch = (async () => Response.json(result)) as any;
    expect((await run()).profile).toEqual(profile);
    result.runtime = {
      tesseractVersion: "5.5.1",
      language: "eng",
      modelSha256: "a".repeat(64),
    };
    result.profile = {
      ...profile,
      decoderThreads: 2,
      fields: [
        {
          field: "clock",
          stage: "primary",
          calls: 7,
          confidentSyntax: 6,
          elapsedMicros: 1200,
        },
      ],
    };
    expect((await run()).runtime).toEqual(result.runtime);
    expect((await run()).profile).toEqual(result.profile);
    result.profile.decoderThreads = 8;
    await expect(run()).rejects.toThrow();
    result.profile.decoderThreads = 2;
    result.profile.fields[0].calls = 8;
    await expect(run()).rejects.toThrow();
    result.profile.fields[0].calls = 7;
    result.profile.fields[0].confidentSyntax = 8;
    await expect(run()).rejects.toThrow();
    result.profile = profile;
    result.runtime.modelSha256 = "unverified";
    await expect(run()).rejects.toThrow();
    delete result.runtime;
    result.profile = {
      ...profile,
      frameAllocations: 3,
      frameBufferBytes: 756544,
    };
    expect((await run()).profile).toEqual(result.profile);
    result.profile = { ...profile, frameBufferBytes: -1 };
    await expect(run()).rejects.toThrow();
    result.profile = { ...profile, recognitionCalls: -1 };
    await expect(run()).rejects.toThrow();
    delete result.profile;
    expect((await run()).profile).toBeUndefined();
  } finally {
    globalThis.fetch = original;
  }
});
