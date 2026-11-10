import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { stringify } from "flatted";
import { prepareTestReport } from "./prepare-test-report.mjs";

async function fixture(t, override = false) {
  const root = await mkdtemp(join(tmpdir(), "lovat-report-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = join(root, "test-report");
  const coverage = override
    ? join(root, "custom-coverage")
    : join(report, "coverage");
  await mkdir(coverage, { recursive: true });
  await mkdir(report, { recursive: true });
  await writeFile(
    join(report, "index.html"),
    "<html><head></head><body>Tests</body></html>",
  );
  await writeFile(
    join(report, "html.meta.json.gz"),
    gzipSync(
      stringify({ config: { root, coverage: { reportsDirectory: coverage } } }),
    ),
  );
  await writeFile(join(coverage, "index.html"), "current coverage");
  return { report, coverage, reportUrl: pathToFileURL(`${report}/`) };
}

test("preserves default coverage and prepares the HTML only once", async (t) => {
  const { report, coverage, reportUrl } = await fixture(t);
  await prepareTestReport(reportUrl);
  await prepareTestReport(reportUrl);
  assert.equal(
    await readFile(join(coverage, "index.html"), "utf8"),
    "current coverage",
  );
  const html = await readFile(join(report, "index.html"), "utf8");
  assert.equal(html.split('id="lovat-coverage-routing"').length - 1, 1);
  assert.ok(html.includes("<body>Tests</body>"));
});

test("bundles overridden coverage and removes stale default files", async (t) => {
  const { report, coverage, reportUrl } = await fixture(t, true);
  const destination = join(report, "coverage");
  await mkdir(destination);
  await writeFile(join(destination, "index.html"), "stale coverage");
  await writeFile(join(destination, "stale-source.html"), "stale source");
  await writeFile(join(coverage, "current-source.html"), "current source");
  await prepareTestReport(reportUrl);
  assert.equal(
    await readFile(join(destination, "index.html"), "utf8"),
    "current coverage",
  );
  assert.equal(
    await readFile(join(destination, "current-source.html"), "utf8"),
    "current source",
  );
  await assert.rejects(readFile(join(destination, "stale-source.html")), {
    code: "ENOENT",
  });
  assert.equal(
    await readFile(join(coverage, "index.html"), "utf8"),
    "current coverage",
  );
});

test("fails when current coverage is missing instead of serving stale output", async (t) => {
  const { report, coverage, reportUrl } = await fixture(t, true);
  await rm(join(coverage, "index.html"));
  await mkdir(join(report, "coverage"));
  await writeFile(join(report, "coverage/index.html"), "stale coverage");
  await assert.rejects(prepareTestReport(reportUrl), { code: "ENOENT" });
});
