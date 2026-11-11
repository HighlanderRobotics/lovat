import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function reportSections() {
  const directory = new URL("./report-sections/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const section = JSON.parse(
        readFileSync(new URL(name, directory), "utf8"),
      );
      if (
        !/^[a-z][a-z0-9-]*$/.test(section.slug) ||
        typeof section.label !== "string" ||
        !Array.isArray(section.required)
      )
        throw new Error(`Invalid report section: ${name}`);
      for (const path of section.required) {
        if (
          typeof path !== "string" ||
          path.includes("..") ||
          path.startsWith("/") ||
          path.includes("\\")
        )
          throw new Error(`Unsafe report path: ${name}`);
      }
      return section;
    });
}

export async function stagePagesReports(artifacts, output) {
  await mkdir(output, { recursive: true });
  const apps = new Set([
    "server",
    "website",
    "learn",
    ...reportSections().map((section) => section.slug),
  ]);
  for (const name of await readdir(artifacts)) {
    const match = /^([a-z][a-z0-9-]*)-(test|browser)-report$/.exec(name);
    if (!match || !apps.has(match[1]))
      throw new Error(`Unexpected public report artifact: ${name}`);
    if (!(await stat(join(artifacts, name))).isDirectory())
      throw new Error(`Expected report directory: ${name}`);
    const destination =
      match[2] === "browser"
        ? join(output, match[1], "browser")
        : join(output, match[1]);
    await cp(join(artifacts, name), destination, { recursive: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (!process.argv[2] || !process.argv[3])
    throw new Error(
      "Usage: node scripts/stage-pages-reports.mjs ARTIFACTS OUTPUT",
    );
  await stagePagesReports(process.argv[2], process.argv[3]);
}
