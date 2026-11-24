import assert from "node:assert/strict";
import console from "node:console";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const load = "/collection/load";
const submit = "/collection/submit";
const legacySubmit = "/collection/scoutreports";

export function checkIosLedger(stage, ledger, original) {
  const entries = ledger
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(entries.length > 0, "Expected the installed app to load a report");
  assert.equal(entries[0].path, load, "First request must load the report");
  const uuid = entries[0].uuid;
  assert.match(uuid, uuidPattern);
  assert.ok(
    entries.every((entry) => entry.uuid === uuid),
    "Report UUID changed during this journey",
  );

  if (stage === "before") {
    assert.ok(
      entries.every((entry) => entry.path === load),
      "Nothing besides the initial report load may run before the outage",
    );
    return uuid;
  }

  assert.equal(stage, "after", "Expected before or after");
  assert.equal(
    uuid,
    original,
    "Report UUID differs from the pre-outage record",
  );
  const submissions = entries.filter(({ path }) =>
    [submit, legacySubmit].includes(path),
  );
  assert.deepEqual(
    submissions.map(({ path }) => path),
    [submit],
    "Expected exactly one successful synthetic submission on replay",
  );
  assert.deepEqual(
    entries.slice(-4).map(({ path }) => path),
    [load, "/collection/start", "/collection/end", submit],
    "Retry must replay the lifecycle before submitting",
  );
  return uuid;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , stage, file, original] = process.argv;
  console.log(checkIosLedger(stage, readFileSync(file, "utf8"), original));
}
