import type { IncomingMessage } from "node:http";
import { HttpError } from "../errors.js";

export async function readServicePayload(
  req: IncomingMessage,
): Promise<{ body: unknown; rawBody: string }> {
  const maximum = 1024 * 1024;
  if (
    req.headers["content-encoding"] &&
    req.headers["content-encoding"] !== "identity"
  ) {
    throw new HttpError(
      415,
      "UNSUPPORTED_ENCODING",
      "Compressed request bodies are unsupported",
    );
  }
  if (Number(req.headers["content-length"]) > maximum)
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body is too large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > maximum)
      throw new HttpError(
        413,
        "REQUEST_TOO_LARGE",
        "Request body is too large",
      );
    chunks.push(Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) return { body: {}, rawBody };
  const contentType = req.headers["content-type"]?.split(";")[0].trim();
  if (contentType === "application/json") {
    try {
      return { body: JSON.parse(rawBody), rawBody };
    } catch {
      throw new HttpError(400, "INVALID_JSON", "Invalid JSON body");
    }
  }
  if (contentType === "application/x-www-form-urlencoded") {
    return { body: Object.fromEntries(new URLSearchParams(rawBody)), rawBody };
  }
  throw new HttpError(
    415,
    "UNSUPPORTED_MEDIA_TYPE",
    "Use application/json or form encoding",
  );
}
