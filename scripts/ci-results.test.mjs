import assert from "node:assert/strict";
import test from "node:test";
import { requireCiResults, jobSelectors } from "./ci-results.mjs";
function fixture(selected = []) {
  const needs = {
    changes: { result: "success", outputs: {} },
    structure: { result: "success" },
    "railway-config": { result: "success" },
    codeql: { result: "success" },
  };
  for (const [job, selector] of Object.entries(jobSelectors)) {
    needs.changes.outputs[selector] = String(selected.includes(selector));
    needs[job] = {
      result: selected.includes(selector) ? "success" : "skipped",
    };
  }
  return needs;
}
test("selected jobs must succeed; unrelated jobs may skip", () => {
  requireCiResults(fixture(["website", "contracts"]));
});
test("an applicable suite cannot silently skip, fail, cancel, or disappear", () => {
  for (const result of ["skipped", "failure", "cancelled", undefined]) {
    const needs = fixture(["contracts"]);
    needs.contracts.result = result;
    assert.throws(() => requireCiResults(needs), /contracts/);
  }
});
test("image failures and unavailable CodeQL results fail the deployment gate", () => {
  for (const result of ["skipped", "failure", "cancelled", undefined]) {
    const needs = fixture(["web-images"]);
    needs["web-images"].result = result;
    assert.throws(() => requireCiResults(needs), /web-images/);
    needs["web-images"].result = "success";
    needs.codeql.result = result;
    assert.throws(() => requireCiResults(needs), /codeql/);
  }
});
test("all three selected Server jobs must succeed independently", () => {
  for (const job of ["server", "server-unit", "server-image"]) {
    for (const result of ["skipped", "failure", "cancelled", undefined]) {
      const needs = fixture(["server"]);
      needs[job].result = result;
      assert.throws(() => requireCiResults(needs), new RegExp(job));
    }
  }
  requireCiResults(fixture(["server"]));
});
test("main publication requires all report producers even without changed files", () => {
  assert.throws(() => requireCiResults(fixture(), true), /required/);
  const needs = fixture([
    "server",
    "collection",
    "dashboard",
    "website",
    "learn",
    "contracts",
  ]);
  requireCiResults(needs, true);
});
test("selector failures, missing outputs and infrastructure failures fail closed", () => {
  for (const job of ["changes", "structure", "railway-config"]) {
    const needs = fixture();
    needs[job].result = "failure";
    assert.throws(() => requireCiResults(needs));
  }
  const needs = fixture();
  delete needs.changes.outputs.contracts;
  assert.throws(() => requireCiResults(needs), /Missing selection/);
});
