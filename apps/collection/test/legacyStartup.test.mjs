import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateLegacyStartup } from "../lib/collection/legacyStartup.ts";

function storage(entries) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

test("fresh installs migrate nothing and make no requests", async () => {
  let called = false;
  assert.deepEqual(
    await migrateLegacyStartup(storage({}), {
      scouter: () => {
        called = true;
      },
    }),
    [],
  );
  assert.equal(called, false);
});
test("legacy team and scouter migrate in order before tournament", async () => {
  const source = storage({
    "team-code": "code",
    scouter: '{"uuid":"one"}',
    tournament: "2026test",
  });
  const calls = [];
  await migrateLegacyStartup(source, {
    "team-code": async (value) => {
      calls.push(value);
    },
    scouter: (value) => {
      calls.push(value.uuid);
    },
    tournament: (value) => {
      calls.push(value);
    },
  });
  assert.deepEqual(calls, ["code", "one", "2026test"]);
  assert.equal(source.values.size, 0);
});
test("offline or malformed migrations retain originals and allow other settings", async () => {
  const source = storage({
    scouter: "bad json",
    tournament: "2026test",
    qrCodeSize: "450",
    history: "private reports",
  });
  let qr;
  const errors = await migrateLegacyStartup(source, {
    scouter: () => {},
    tournament: () => false,
    qrCodeSize: (value) => {
      qr = value;
    },
  });
  assert.equal(errors.length, 1);
  assert.equal(qr, 450);
  assert.equal(source.values.get("tournament"), "2026test");
  assert.equal(source.values.get("scouter"), "bad json");
  assert.equal(source.values.get("history"), "private reports");
});
test("async migration failure never deletes the source", async () => {
  const source = storage({ tournament: "2026test" });
  assert.equal(
    (
      await migrateLegacyStartup(source, {
        tournament: async () => {
          throw new Error("offline");
        },
      })
    ).length,
    1,
  );
  assert.equal(source.values.size, 1);
});
