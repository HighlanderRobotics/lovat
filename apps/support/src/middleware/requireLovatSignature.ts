import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";

const LOVAT_SIGNING_KEY = process.env.LOVAT_SIGNING_KEY;

export const requireLovatSignature = async (c: Context, next: Next) => {
  if (!LOVAT_SIGNING_KEY) {
    throw new Error("LOVAT_SIGNING_KEY is not configured");
  }

  const signature = c.req.header("x-signature");
  const timestampHeader = c.req.header("x-timestamp");

  const timestamp = Number(timestampHeader);

  if (!signature || !timestampHeader || !Number.isFinite(timestamp)) {
    return c.text("Unauthorized", 401);
  }

  // Reject timestamps more than 5 minutes away from now
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestamp) > 5 * 60) {
    return c.text("Signature expired", 401);
  }

  const body = await c.req.raw.clone().text();

  const payload = JSON.stringify({
    path: c.req.path,
    method: c.req.method,
    body,
    timestamp,
  });

  const generatedSignature = createHmac("sha256", LOVAT_SIGNING_KEY)
    .update(payload)
    .digest("hex");

  // Avoid a simple string comparison for the HMAC
  const provided = Buffer.from(signature, "hex");
  const generated = Buffer.from(generatedSignature, "hex");

  if (
    provided.length !== generated.length ||
    !timingSafeEqual(provided, generated)
  ) {
    return c.text("Invalid signature", 403);
  }

  await next();
};
