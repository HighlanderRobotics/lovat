import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export async function prepareContractReport(root, steps, revision = "unknown") {
  await mkdir(root, { recursive: true });
  const stages = ["collection", "server", "dashboard"];
  const passed = stages.every((stage) => steps[stage]?.outcome === "success");
  const files = (await readdir(root)).filter(
    (name) => /^[a-zA-Z0-9_.-]+$/.test(name) && name !== "index.html",
  );
  await writeFile(
    join(root, "outcomes.json"),
    JSON.stringify(
      {
        revision,
        passed,
        stages: Object.fromEntries(
          stages.map((stage) => [stage, steps[stage]?.outcome ?? "not-run"]),
        ),
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "index.html"),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cross-app contracts</title><style>body{font:16px system-ui;max-width:960px;margin:2rem auto;padding:1rem}li{margin:.5rem 0}</style><h1>Cross-app contracts: ${passed ? "PASSED" : "FAILED"}</h1><p>Collection serialization → Server persistence and source-team privacy → Dashboard decoding. Synthetic data only.</p><p>Revision: ${escape(revision)}</p><ul>${stages.map((stage) => `<li>${stage}: ${escape(steps[stage]?.outcome ?? "not-run")}</li>`).join("")}</ul><h2>Evidence</h2><ul><li><a href="outcomes.json">Stage outcomes</a></li>${files.map((name) => `<li><a href="${name}">${escape(name)}</a></li>`).join("")}</ul>`,
  );
  return passed;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const passed = await prepareContractReport(
    process.argv[2],
    JSON.parse(process.env.CONTRACT_STEPS ?? "{}"),
    process.env.GITHUB_SHA,
  );
  if (!passed) process.exitCode = 1;
}
