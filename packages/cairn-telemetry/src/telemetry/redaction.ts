const secret =
  /authorization|cookie|password|passwd|secret|token|api.?key|credential|email|ip.?address/i;
const approved = new Set([
  "platform",
  "os",
  "browser",
  "region",
  "sdkVersion",
  "exporterDropped",
  "exporterFailures",
]);
export function sanitizeMetadata(
  input: Record<string, string | number | boolean> | undefined,
) {
  return Object.fromEntries(
    Object.entries(input ?? {})
      .filter(([key]) => approved.has(key) && !secret.test(key))
      .map(([k, v]) => [k, typeof v === "string" ? redact(v) : v]),
  );
}
export function redact(input: string) {
  return input
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(
      /([?&](?:token|key|password|secret|email)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(
      /((?:password|secret|token|api[_-]?key|authorization|cookie)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}
export function normalizeRoute(path: string) {
  return path
    .split("?")[0]
    .replace(/\/[0-9]+(?=\/|$)/g, "/:id")
    .replace(/\/[a-f0-9]{8}-[a-f0-9-]{27,}(?=\/|$)/gi, "/:id");
}
export async function fingerprint(type: string, message: string, stack = "") {
  const normalized = `${type}:${message.replace(/\b\d+\b/g, "#")}:${stack
    .split("\n")
    .slice(0, 4)
    .join("\n")
    .replace(/:\d+:\d+/g, ":#:#")}`;
  const data = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return [...new Uint8Array(data)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
