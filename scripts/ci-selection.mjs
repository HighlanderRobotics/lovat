import { readFileSync } from "node:fs";
export const filters = JSON.parse(
  readFileSync(new URL("../.github/ci-filters.json", import.meta.url), "utf8"),
);
// These repository rules deliberately use only literals, * and **. Fail if the
// config starts relying on another glob dialect instead of silently mis-testing it.
export function matches(pattern, path) {
  if ([...pattern].some((character) => "{}[]?!".includes(character))) {
    throw new Error("Unsupported CI test glob: " + pattern);
  }
  let regex = "";
  for (let i = 0; i < pattern.length; i++) {
    if (pattern.slice(i, i + 3) === "**/") {
      regex += "(?:.*/)?";
      i += 2;
    } else if (pattern.slice(i, i + 2) === "**") {
      regex += ".*";
      i++;
    } else if (pattern[i] === "*") {
      regex += "[^/]*";
    } else {
      const character = pattern[i];
      regex += "\\^$.*+?()[]{}|".includes(character)
        ? "\\" + character
        : character;
    }
  }
  return new RegExp("^" + regex + "$").test(path);
}
export function selectJobs(paths) {
  return Object.fromEntries(
    Object.entries(filters).map(([job, patterns]) => [
      job,
      paths.some((path) => patterns.some((pattern) => matches(pattern, path))),
    ]),
  );
}
