import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
export const jobSelectors = {
  reviewer: "reviewer",
  server: "server",
  worker: "worker",
  collection: "collection",
  "dashboard-format": "dashboard",
  dashboard: "dashboard",
  "dashboard-browser": "dashboard",
  website: "website",
  "website-browser": "website",
  learn: "learn",
  contracts: "contracts",
};
const reportJobs = new Set([
  "server",
  "collection",
  "dashboard",
  "dashboard-browser",
  "website",
  "website-browser",
  "learn",
  "contracts",
]);
export function requireCiResults(needs, publishReports = false) {
  const errors = [];
  for (const job of ["changes", "structure", "railway-config"])
    if (needs[job]?.result !== "success") errors.push(`${job} must succeed`);
  const selected = needs.changes?.outputs ?? {};
  for (const [job, selector] of Object.entries(jobSelectors)) {
    if (!["true", "false"].includes(selected[selector]))
      errors.push(`Missing selection for ${selector}`);
    const required =
      selected[selector] === "true" || (publishReports && reportJobs.has(job));
    const result = needs[job]?.result;
    if (
      required ? result !== "success" : !["success", "skipped"].includes(result)
    )
      errors.push(
        `${job}: ${result ?? "missing"}${required ? " (required)" : ""}`,
      );
  }
  if (errors.length) throw new Error(errors.join("\n"));
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  requireCiResults(
    JSON.parse(process.env.NEEDS_JSON ?? "{}"),
    process.env.PUBLISH_REPORTS === "true",
  );
