const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-or-v1-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENROUTER_KEY]"],
  [/github_pat_[A-Za-z0-9_]{16,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/gh[pousr]_[A-Za-z0-9]{16,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g, "Bearer [REDACTED]"],
  [
    /(?<key>api[_-]?key|secret|token|password)\s*[:=]\s*(?<quote>["'])(?<value>[^"'\n]{12,})(?<end>\k<quote>)/gi,
    "$<key>=[REDACTED]",
  ],
];

/**
 * Remove credential-shaped values from text that will be published to GitHub.
 * The model never receives the OpenRouter key, but committed secrets can appear
 * in a diff and must not be copied into a public comment.
 */
export function redactSecrets(
  value: string,
  knownSecrets: readonly string[] = [],
): string {
  let result = value;

  for (const secret of knownSecrets) {
    if (secret.length >= 8) {
      result = result.split(secret).join("[REDACTED]");
    }
  }

  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

export function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(0, maximum - 1))}\u2026`;
}

export function safeErrorMessage(
  error: unknown,
  knownSecrets: readonly string[] = [],
  maximum = 500,
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  return truncate(redactSecrets(raw, knownSecrets), maximum);
}
