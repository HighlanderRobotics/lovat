import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { parse } from "flatted";

// Vitest 3's coverage iframe uses /coverage/index.html. Keep it relative to
// the generated report so both Pages project paths and custom domains work.
const coverageRouting = `<script id="lovat-coverage-routing">
  const reportBase = new URL("./", window.location.href);
  const fixCoverageRoute = () => {
    const frame = document.getElementById("vitest-ui-coverage");
    const coveragePath = new URL("coverage/index.html", reportBase).pathname;
    if (frame && frame.getAttribute("src") !== coveragePath) {
      frame.setAttribute("src", coveragePath);
    }
  };
  new MutationObserver(fixCoverageRoute).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
</script>`;

export async function prepareTestReport(
  reportDirectory = new URL("../test-report/", import.meta.url),
) {
  const reportPath = new URL("index.html", reportDirectory);
  const html = await readFile(reportPath, "utf8");
  if (!html.includes("</head>")) {
    throw new Error("Vitest HTML report is missing its closing head tag");
  }
  const metadata = parse(
    gunzipSync(
      await readFile(new URL("html.meta.json.gz", reportDirectory)),
    ).toString(),
  );
  const source = resolve(
    metadata.config.root,
    metadata.config.coverage.reportsDirectory,
  );
  const destination = fileURLToPath(new URL("coverage/", reportDirectory));
  // Use the effective coverage directory recorded by Vitest, including CLI
  // overrides. Bundle that run's files so a static host can serve them.
  const index = await stat(resolve(source, "index.html"));
  if (!index.isFile()) throw new Error("Coverage index must be a file");
  if (resolve(source) !== resolve(destination)) {
    if (resolve(destination).startsWith(`${resolve(source)}${sep}`)) {
      throw new Error(
        "Coverage output cannot contain the static report directory",
      );
    }
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, { recursive: true });
  }
  if (!html.includes('id="lovat-coverage-routing"')) {
    await writeFile(
      reportPath,
      html.replace("</head>", `${coverageRouting}</head>`),
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await prepareTestReport();
}
