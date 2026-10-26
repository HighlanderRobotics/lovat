import { z } from "zod";
import type { Template } from "./media";

export class OcrServiceUnavailable extends Error {}

const resultSchema = z.object({
  observations: z
    .array(
      z.object({
        time: z.number().int().min(0).max(163),
        red: z.number().int().min(0).max(1000),
        blue: z.number().int().min(0).max(1000),
        confidence: z.number().min(85).max(100),
      }),
    )
    .max(600),
  layoutVersion: z.string(),
  elapsedMs: z.number().nonnegative(),
  frames: z.number().int().min(1).max(600),
});

export async function extractWithService(
  path: string,
  expectedTeams: number[],
  expectedMatchLabel: string,
  template: Template,
  url: string,
  token: string,
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
    JSON.stringify({ template, expectedTeams, expectedMatchLabel }),
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
  if (!response.ok)
    throw new Error(`OCR service rejected video (${response.status})`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing OCR service response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
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
  const text = new TextDecoder().decode(bytes);
  const result = resultSchema.parse(JSON.parse(text));
  if (
    ![template, ...(template.alternatives ?? [])].some(
      (layout) => layout.version === result.layoutVersion,
    )
  )
    throw new Error("OCR service returned an unknown layout");
  return result.observations;
}
