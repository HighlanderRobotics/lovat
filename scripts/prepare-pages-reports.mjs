import { reportSections } from "./stage-pages-reports.mjs";
import { lstat, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const extensions = reportSections();
const escape = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const requiredReports = [
  "server/index.html",
  "server/coverage/index.html",
  "learn/index.html",
  "learn/unit.xml",
  "learn/browser/index.html",
  "website/index.html",
  "website/coverage/index.html",
  "website/browser/index.html",
  ...extensions.flatMap((section) =>
    section.required.map((path) => `${section.slug}/${path}`),
  ),
];

async function rejectLinks(directory) {
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error(`Report must not contain symbolic links: ${path}`);
    if (info.isDirectory()) await rejectLinks(path);
  }
}

export async function preparePagesReports(directory, revision = "") {
  const root = resolve(directory);
  await rejectLinks(root);
  for (const path of requiredReports) {
    if (!(await stat(join(root, path))).isFile())
      throw new Error(`Missing report: ${path}`);
  }
  await writeFile(join(root, ".nojekyll"), "");
  await writeFile(
    join(root, "revision.json"),
    JSON.stringify({ revision }, null, 2) + "\n",
  );
  await writeFile(
    join(root, "index.html"),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lovat test reports</title>
<style>body{font:18px system-ui;max-width:55rem;margin:3rem auto;padding:0 1rem;line-height:1.7}a{color:#350868}td,th{text-align:left;padding:.5rem 1rem}</style></head>
<body><h1>Lovat test reports</h1><p>Unit, coverage and production-browser results from one successful main build.</p>
<table><thead><tr><th>Application</th><th>Tests</th><th>Coverage</th><th>Browser</th></tr></thead><tbody>
<tr><th>Server</th><td><a href="server/">Vitest results</a></td><td><a href="server/coverage/">Coverage</a></td><td>—</td></tr>
<tr><th>Learn</th><td><a href="learn/">Node results</a></td><td><a href="learn/">Link-plugin coverage</a></td><td><a href="learn/browser/">Playwright results</a></td></tr>
<tr><th>Website</th><td><a href="website/">Vitest results</a></td><td><a href="website/coverage/">Coverage</a></td><td><a href="website/browser/">Playwright results</a></td></tr>
${extensions.map((section) => `<tr><th>${escape(section.label)}</th><td><a href="${section.slug}/">Test results</a></td><td>${section.required.includes("coverage/index.html") ? `<a href="${section.slug}/coverage/">Coverage</a>` : "—"}</td><td>${section.browser ? `<a href="${section.slug}/browser/">Integration results</a>` : "Release checks run separately"}</td></tr>`).join("\n")}
</tbody></table><p><a href="revision.json">Build revision</a></p></body></html>`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (!process.argv[2])
    throw new Error(
      "Usage: node scripts/prepare-pages-reports.mjs OUTPUT_DIRECTORY",
    );
  await preparePagesReports(process.argv[2], process.env.GITHUB_SHA || "local");
}
