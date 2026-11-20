import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const origin = "http://127.0.0.1:43189";
const fixture = JSON.parse(
  await readFile(process.env.LIVE_ACTIVITY_FIXTURE, "utf8"),
);
const headers = {
  "X-Team-Code": fixture.teamCode,
  "X-Scouter-UUID": fixture.scouterUuid,
};
const path = `/collection/live-activities/${encodeURIComponent(fixture.tournamentKey)}`;

function change(command) {
  execFileSync(process.execPath, ["tools/live-activity-fixture.mjs", command], {
    stdio: "pipe",
  });
}

async function state() {
  const response = await fetch(origin + path, { headers });
  assert.equal(response.status, 200);
  return (await response.json()).state;
}

try {
  change("seed");
  assert.equal((await fetch(origin + path)).status, 400);
  assert.equal(
    (
      await fetch(origin + path, {
        headers: { ...headers, "X-Team-Code": "invalid-test-code" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(origin + path, {
        headers: {
          ...headers,
          "X-Scouter-UUID": "2ecb916b-fd99-4886-81ba-8e3712ce7dda",
        },
      })
    ).status,
    404,
  );
  let value = await state();
  assert.equal(value.phase, "waiting");
  assert.equal(value.nowMatch, "Q27");
  assert.deepEqual(
    value.assignments.map((a) => a.matchLabel),
    ["Q28", "Q29", "P1", "F1"],
  );
  assert.equal(value.assignments[0].teamNumber, 8433);
  change("advance");
  value = await state();
  assert.equal(value.phase, "onShift");
  assert.equal(value.nowMatch, "Q28");
  change("reassign");
  assert.equal((await state()).assignments[0].teamNumber, 254);
  change("cancel");
  value = await state();
  assert.equal(value.nowMatch, "Q29");
  assert.equal(value.assignments[0].teamNumber, 8033);
  change("advance");
  assert.equal((await state()).assignments[0].matchLabel, "P1");
  change("advance");
  assert.equal((await state()).assignments[0].matchLabel, "F1");
  change("advance");
  assert.equal(await state(), null);
  console.log(
    "Live HTTP/PostgreSQL checks passed: authorization, before/on shift, reassignment, cancellation, Q/P/F advancement, and schedule completion.",
  );
} finally {
  change("seed");
}
