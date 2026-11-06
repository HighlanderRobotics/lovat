import assert from "node:assert/strict";
import test from "node:test";
import { codeqlMatrix } from "./codeql-matrix.mjs";

test("server and tooling changes do not start native builds", () => {
  const matrix = codeqlMatrix(["javascript"]);
  assert.deepEqual(
    matrix.include.map((job) => job.language),
    ["javascript-typescript"],
  );
  assert.equal(matrix.include[0].os, "ubuntu-latest");
});
test("platform changes select only that platform", () => {
  assert.deepEqual(
    codeqlMatrix(["ios"]).include.map((job) => job.platform),
    ["ios"],
  );
  assert.deepEqual(
    codeqlMatrix(["macos"]).include.map((job) => job.platform),
    ["macos"],
  );
  assert.deepEqual(
    codeqlMatrix(["android"]).include.map((job) => job.language),
    ["java-kotlin"],
  );
});
test("workflow edits outside CodeQL select only the Actions analysis", () => {
  assert.deepEqual(
    codeqlMatrix(["actions"]).include.map((job) => job.language),
    ["actions"],
  );
});
test("docs, unsupported languages, and unknown filters select no analyses", () => {
  assert.deepEqual(codeqlMatrix([]), { include: [] });
  assert.deepEqual(codeqlMatrix(["unknown"]), { include: [] });
});
test("combined changes select each analysis once", () => {
  assert.equal(
    codeqlMatrix(["javascript", "ios", "javascript"]).include.length,
    2,
  );
});
test("CodeQL configuration changes and explicit manual scans select all six analyses", () => {
  assert.equal(codeqlMatrix(["workflow"]).include.length, 6);
  assert.equal(codeqlMatrix([], true).include.length, 6);
});
test("invalid filter output fails rather than silently omitting analysis", () => {
  for (const value of [null, {}, "javascript", [1]])
    assert.throws(() => codeqlMatrix(value));
});
