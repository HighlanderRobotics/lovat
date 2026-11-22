import { HttpError } from "../errors.js";

export async function readServicePayload(
  req: Request,
  maximum = 1024 * 1024,
  jsonOnly = false,
): Promise<{ body: unknown; rawBody: string }> {
  const encoding = req.headers.get("content-encoding");
  if (encoding && encoding !== "identity")
    throw new HttpError(
      415,
      "UNSUPPORTED_ENCODING",
      "Compressed request bodies are unsupported",
    );
  if (Number(req.headers.get("content-length")) > maximum)
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body is too large");
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) {
          await reader.cancel();
          throw new HttpError(
            413,
            "REQUEST_TOO_LARGE",
            "Request body is too large",
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const rawBody = new TextDecoder().decode(bytes);
  const contentType = req.headers.get("content-type")?.split(";")[0].trim();
  if (!rawBody && !jsonOnly) return { body: {}, rawBody };
  if (contentType === "application/json") {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "INVALID_JSON", "Invalid JSON body");
    }
    // Bound recursive schema work for arbitrary game JSON.
    const pending: { value: unknown; depth: number }[] = [
      { value: body, depth: 0 },
    ];
    let nodes = 0;
    while (pending.length) {
      const { value, depth } = pending.pop()!;
      if (++nodes > 100000 || depth > 64)
        throw new HttpError(400, "INVALID_JSON", "JSON is too complex");
      if (value && typeof value === "object") {
        for (const child of Object.values(value))
          pending.push({ value: child, depth: depth + 1 });
      }
    }
    return { body, rawBody };
  }
  if (!jsonOnly && contentType === "application/x-www-form-urlencoded")
    return { body: Object.fromEntries(new URLSearchParams(rawBody)), rawBody };
  throw new HttpError(
    415,
    "UNSUPPORTED_MEDIA_TYPE",
    jsonOnly ? "Use application/json" : "Use application/json or form encoding",
  );
}
