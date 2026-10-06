import { readFile, writeFile } from "node:fs/promises";

const reportPath = new URL("../test-report/index.html", import.meta.url);
const html = await readFile(reportPath, "utf8");

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

if (!html.includes('id="lovat-coverage-routing"')) {
  if (!html.includes("</head>")) {
    throw new Error("Vitest HTML report is missing its closing head tag");
  }
  await writeFile(
    reportPath,
    html.replace("</head>", `${coverageRouting}</head>`),
  );
}
