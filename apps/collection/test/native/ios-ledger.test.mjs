import assert from "node:assert/strict";
import { test } from "node:test";
import { checkIosLedger } from "../../scripts/check-native-ios-ledger.mjs";

const uuid = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const row = (path, id = uuid) => JSON.stringify({ path, uuid: id });
const load = row("/collection/load");
const submit = row("/collection/submit");
const replay = [
  load,
  row("/collection/start"),
  row("/collection/end"),
  submit,
].join("\n");

test("accepts the initial load and a single complete same-UUID replay", () => {
  assert.equal(checkIosLedger("before", load), uuid);
  assert.equal(checkIosLedger("after", `${load}\n${replay}\n`, uuid), uuid);
});

test("rejects missing or premature pre-outage evidence", () => {
  assert.throws(() => checkIosLedger("before", ""), /load a report/);
  assert.throws(() => checkIosLedger("before", replay), /initial report load/);
});

test("rejects a replaced report, duplicate submission and missing lifecycle", () => {
  assert.throws(
    () => checkIosLedger("after", `${load}\n${replay}`, other),
    /pre-outage record/,
  );
  assert.throws(
    () => checkIosLedger("after", `${load}\n${replay}\n${submit}`, uuid),
    /exactly one successful/,
  );
  assert.throws(
    () => checkIosLedger("after", `${load}\n${submit}`, uuid),
    /replay the lifecycle/,
  );
});
