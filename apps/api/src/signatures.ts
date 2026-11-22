import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
export function createSignatureVerifier(options: {
  lovatKey?: string;
  slackSecret?: string;
  now?: () => number;
}) {
  return async (
    headers: IncomingHttpHeaders,
    rawBody: string,
    slack: boolean,
    method: string,
    path: string,
    body: unknown,
  ): Promise<boolean> => {
    const time = headers[slack ? "x-slack-request-timestamp" : "x-timestamp"];
    const signature = headers[slack ? "x-slack-signature" : "x-signature"];
    const key = slack ? options.slackSecret : options.lovatKey;
    if (
      !key ||
      typeof time !== "string" ||
      typeof signature !== "string" ||
      !/^\d+$/.test(time)
    )
      return false;
    const timestamp = Number(time);
    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Math.floor((options.now?.() ?? Date.now()) / 1000) - timestamp) >
        300
    )
      return false;
    const text = JSON.stringify(body);
    const payload = slack
      ? "v0:" + time + ":" + rawBody
      : JSON.stringify({
          path,
          method,
          body: text === "{}" ? "" : text,
          timestamp,
        });
    const expected = createHmac("sha256", key).update(payload).digest();
    const received = slack ? signature.replace(/^v0=/, "") : signature;
    if (
      !/^[a-fA-F0-9]{64}$/.test(received) ||
      (slack && !signature.startsWith("v0="))
    )
      return false;
    return timingSafeEqual(expected, Buffer.from(received, "hex"));
  };
}
