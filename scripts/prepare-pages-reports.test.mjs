import { stagePagesReports, reportSections } from "./stage-pages-reports.mjs";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { test } from "node:test";
import {
  preparePagesReports,
  requiredReports,
} from "./prepare-pages-reports.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "lovat-pages-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of requiredReports) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `synthetic ${path}`);
  }
  return root;
}

test("indexes all three apps with relative links and preserves their nested reports", async (t) => {
  const root = await fixture(t);
  await preparePagesReports(root, "synthetic-commit");
  const html = await readFile(join(root, "index.html"), "utf8");
  for (const path of [
    "server/",
    "learn/",
    "website/",
    "website/browser/",
    "learn/browser/",
  ]) {
    assert.ok(html.includes(`href="${path}"`));
    assert.equal(
      new URL(path, "https://example.invalid/lovat/").pathname,
      `/lovat/${path}`,
    );
  }
  assert.equal(
    await readFile(join(root, "server/index.html"), "utf8"),
    "synthetic server/index.html",
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "revision.json"), "utf8")),
    { revision: "synthetic-commit" },
  );
});

test("refuses a partial upload rather than publishing over another app report", async (t) => {
  const root = await fixture(t);
  await rm(join(root, "learn/browser/index.html"));
  await assert.rejects(preparePagesReports(root));
  await assert.rejects(readFile(join(root, "index.html")));
});

test("rejects symbolic links before packaging a Pages artifact", async (t) => {
  const root = await fixture(t);
  await symlink(join(root, "server/index.html"), join(root, "unexpected-link"));
  await assert.rejects(preparePagesReports(root), /symbolic links/);
});

test("stages named app artifacts and browser reports without overwriting unit results", async (t) => {
  const root = await fixture(t);
  const artifacts = join(root, "artifacts");
  await mkdir(join(artifacts, "website-test-report"), { recursive: true });
  await mkdir(join(artifacts, "website-browser-report"), { recursive: true });
  await writeFile(join(artifacts, "website-test-report/index.html"), "unit");
  await writeFile(
    join(artifacts, "website-browser-report/index.html"),
    "browser",
  );
  const output = join(root, "output");
  await stagePagesReports(artifacts, output);
  assert.equal(
    await readFile(join(output, "website/index.html"), "utf8"),
    "unit",
  );
  assert.equal(
    await readFile(join(output, "website/browser/index.html"), "utf8"),
    "browser",
  );
  assert.ok(reportSections().length > 0);
});

test("refuses unknown artifacts rather than publishing arbitrary logs", async (t) => {
  const root = await fixture(t);
  const artifacts = join(root, "artifacts");
  await mkdir(join(artifacts, "unexpected-report"), { recursive: true });
  await assert.rejects(
    stagePagesReports(artifacts, join(root, "out")),
    /Unexpected public report/,
  );
});
