import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const jobs = [
  {
    filter: "actions",
    language: "actions",
    os: "ubuntu-latest",
    "build-mode": "none",
  },
  {
    filter: "javascript",
    language: "javascript-typescript",
    os: "ubuntu-latest",
    "build-mode": "none",
  },
  {
    filter: "cpp",
    language: "c-cpp",
    os: "ubuntu-latest",
    "build-mode": "none",
  },
  {
    filter: "android",
    language: "java-kotlin",
    os: "ubuntu-latest",
    "build-mode": "manual",
  },
  {
    filter: "ios",
    language: "swift",
    platform: "ios",
    os: "macos-15",
    "build-mode": "manual",
  },
  {
    filter: "macos",
    language: "swift",
    platform: "macos",
    os: "macos-15",
    "build-mode": "manual",
  },
];

export function codeqlMatrix(changes, forceAll = false) {
  if (
    !Array.isArray(changes) ||
    !changes.every((value) => typeof value === "string")
  ) {
    throw new TypeError("Changed CodeQL filters must be an array of strings");
  }
  const all = forceAll || changes.includes("workflow");
  return {
    include: jobs
      .filter((job) => all || changes.includes(job.filter))
      .map(({ filter: _filter, ...job }) => job),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const matrix = codeqlMatrix(
    JSON.parse(process.env.CHANGED_FILTERS || "[]"),
    process.env.FORCE_ALL === "true",
  );
  const output = `matrix=${JSON.stringify(matrix)}\nany=${matrix.include.length > 0}\n`;
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(`Selected ${matrix.include.length} CodeQL analyses`);
}
