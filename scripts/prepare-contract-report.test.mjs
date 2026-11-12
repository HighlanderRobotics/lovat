import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareContractReport } from "./prepare-contract-report.mjs";
test("missing or failed stages still produce diagnostic HTML without reporting success", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "lovat-contracts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(
    await prepareContractReport(
      root,
      { collection: { outcome: "success" }, server: { outcome: "failure" } },
      "synthetic",
    ),
    false,
  );
  assert.match(await readFile(join(root, "index.html"), "utf8"), /FAILED/);
  assert.equal(
    JSON.parse(await readFile(join(root, "outcomes.json"), "utf8")).stages
      .dashboard,
    "not-run",
  );
  assert.equal(
    await prepareContractReport(
      root,
      Object.fromEntries(
        ["collection", "server", "dashboard"].map((stage) => [
          stage,
          { outcome: "success" },
        ]),
      ),
      "synthetic",
    ),
    true,
  );
  assert.match(await readFile(join(root, "index.html"), "utf8"), /PASSED/);
});
