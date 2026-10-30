import { z } from "zod";
import type { Template } from "./media";

export class OcrServiceUnavailable extends Error {}
export class OcrExtractionError extends Error {
  constructor(public readonly code: string) {
    super(`OCR extraction failed: ${code}`);
  }
}

export const channelSchema = z
  .array(
    z.object({
      time: z.number().int().min(0).max(163),
      count: z.number().int().min(0).max(1000),
      confidence: z.number().min(85).max(100),
    }),
  )
  .max(600);
export const channelsSchema = z.object({
  red: channelSchema,
  blue: channelSchema,
});
const resultSchema = z.object({
  fuelWordFallback: z.boolean().optional(),
  recognitionCache: z.boolean().optional(),
  profile: z
    .object({
      probeMs: z.number().int().nonnegative(),
      decoderThreads: z
        .union([z.literal(1), z.literal(2), z.literal(4)])
        .optional(),
      decoderReadWaitMs: z.number().int().nonnegative(),
      identityMs: z.number().int().nonnegative(),
      clockMs: z.number().int().nonnegative(),
      counterMs: z.number().int().nonnegative(),
      recognitionMs: z.number().int().nonnegative(),
      recognitionCalls: z.number().int().nonnegative(),
      cacheHits: z.number().int().nonnegative(),
      frameAllocations: z.number().int().nonnegative().optional(),
      frameBufferBytes: z.number().int().nonnegative().optional(),
      fields: z
        .array(
          z
            .object({
              field: z.enum(["text", "fuel", "points", "clock"]),
              stage: z.enum([
                "primary",
                "normalizedGray",
                "binary",
                "glyph",
                "word",
              ]),
              calls: z.number().int().nonnegative(),
              confidentSyntax: z.number().int().nonnegative(),
              elapsedMicros: z.number().int().nonnegative(),
            })
            .refine(
              (r) => r.confidentSyntax <= r.calls,
              "Syntax count exceeds calls",
            ),
        )
        .max(20)
        .optional(),
    })
    .refine(
      (p) =>
        !p.fields ||
        (new Set(p.fields.map((r) => `${r.field}:${r.stage}`)).size ===
          p.fields.length &&
          p.fields.reduce((n, r) => n + r.calls, 0) === p.recognitionCalls),
      "Field call totals or keys do not reconcile",
    )
    .optional(),
  runtime: z
    .object({
      tesseractVersion: z.string().min(1).max(80),
      language: z.literal("eng"),
      modelSha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .optional(),
  channels: channelsSchema.optional(),
  observations: z
    .array(
      z.object({
        time: z.number().int().min(0).max(163),
        red: z.number().int().min(0).max(1000),
        blue: z.number().int().min(0).max(1000),
        confidence: z.number().min(85).max(100),
        redPoints: z.number().int().min(0).max(9999).optional(),
        bluePoints: z.number().int().min(0).max(9999).optional(),
        pointsConfidence: z.number().min(85).max(100).optional(),
      }),
    )
    .max(600),
  layoutVersion: z.string(),
  elapsedMs: z.number().nonnegative(),
  frames: z.number().int().min(1).max(600),
});

export async function extractServiceEvidence(
  path: string,
  expectedTeams: number[],
  expectedMatchLabel: string,
  template: Template,
  url: string,
  token: string,
  tuning?: { fuelWordFallback?: boolean; recognitionCache?: boolean },
) {
  const endpoint = new URL(url);
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    token.length < 32
  )
    throw new Error("Invalid OCR service configuration");
  const body = new FormData();
  body.append(
    "metadata",
    JSON.stringify({ template, expectedTeams, expectedMatchLabel, tuning }),
  );
  body.append("video", Bun.file(path), "match.mp4");
  let response: Response;
  try {
    response = await fetch(new URL("/extract", endpoint), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(9 * 60000),
      redirect: "error",
    });
  } catch {
    throw new OcrServiceUnavailable(
      "OCR service is unavailable; retry this job",
    );
  }
  if (
    response.status >= 500 ||
    response.status === 429 ||
    response.status === 401 ||
    response.status === 403
  )
    throw new OcrServiceUnavailable(
      `OCR service is unavailable (${response.status}); retry this job`,
    );
  if (response.status === 422) {
    const code = (await boundedText(response, 128)).trim();
    if (
      [
        "IDENTITY_UNVERIFIED",
        "BUDGET_EXCEEDED",
        "ENGINE_UNAVAILABLE",
        "INVALID_MEDIA",
        "EXTRACTION_FAILED",
      ].includes(code)
    )
      throw new OcrExtractionError(code);
    throw new OcrExtractionError("EXTRACTION_FAILED");
  }
  if (!response.ok)
    throw new Error(`OCR service rejected video (${response.status})`);
  const text = await boundedText(response, 256 * 1024);
  const result = resultSchema.parse(JSON.parse(text));
  if (
    ![template, ...(template.alternatives ?? [])].some(
      (layout) => layout.version === result.layoutVersion,
    )
  )
    throw new Error("OCR service returned an unknown layout");
  return result;
}

// Compatibility for the normal review pipeline, which requires paired counters.
export async function extractWithService(
  ...args: Parameters<typeof extractServiceEvidence>
) {
  return (await extractServiceEvidence(...args)).observations;
}

export async function boundedText(
  response: Response,
  maximum: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing OCR service response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Oversized OCR service response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
