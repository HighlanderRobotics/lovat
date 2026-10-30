const regexCache = new Map<string, RegExp>();

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

/**
 * Convert a small, gitignore-like glob into a regular expression.
 *
 * - `**` matches across path separators (including none).
 * - `*` matches within one path segment.
 * - `?` matches one character within a segment.
 * - A pattern without a slash matches a basename at any depth, so `*.lock`
 *   excludes `apps/server/package-lock.json`.
 * - A trailing `/**` also matches the directory itself.
 */
export function matchesGlob(path: string, pattern: string): boolean {
  const normalizedPath = path.replaceAll("\\", "/").replace(/^\.?\//, "");
  const normalizedPattern = pattern
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");

  if (normalizedPattern.length === 0) return false;

  const cacheKey = normalizedPattern;
  let regex = regexCache.get(cacheKey);

  if (!regex) {
    const hasSlash = normalizedPattern.includes("/");
    const body = globBody(normalizedPattern);
    const prefix = hasSlash ? "^" : "(?:^|/)";
    regex = new RegExp(`${prefix}${body}$`);
    regexCache.set(cacheKey, regex);
  }

  return regex.test(normalizedPath);
}

function globBody(pattern: string): string {
  let result = "";
  let index = 0;

  while (index < pattern.length) {
    const character = pattern[index]!;

    if (character === "*") {
      const isDouble = pattern[index + 1] === "*";
      if (isDouble) {
        const nextCharacter = pattern[index + 2];
        if (nextCharacter === "/") {
          result += "(?:.*/)?";
          index += 3;
          continue;
        }
        if (index + 2 === pattern.length) {
          // A trailing `/**` matches the directory itself and everything below it.
          if (result.endsWith("/")) {
            result = result.slice(0, -1);
          }
          result += "(?:/.*)?";
          index += 2;
          continue;
        }
        result += ".*";
        index += 2;
        continue;
      }
      result += "[^/]*";
      index += 1;
      continue;
    }

    if (character === "?") {
      result += "[^/]";
      index += 1;
      continue;
    }

    result += escapeRegex(character);
    index += 1;
  }

  return result;
}

export function isExcludedPath(
  path: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => matchesGlob(path, pattern));
}
