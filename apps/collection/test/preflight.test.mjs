import assert from "node:assert/strict";
import { test } from "node:test";
import { preflight } from "../scripts/native-preflight.mjs";

const healthy = {
  node: "24.6.0",
  platform: "darwin",
  env: { ANDROID_HOME: "/sdk" },
  exists: () => true,
  run: (command) => ({
    ok: true,
    text:
      command === "npm"
        ? "11.5.1"
        : command === "java"
          ? 'openjdk version "21.0.5"'
          : command.endsWith("adb")
            ? "List of devices attached\nphone\tdevice\n"
            : "Xcode 27.0\niOS 27.0",
  }),
};

test("tooling checks do not need native SDKs", () => {
  assert.equal(
    preflight("tooling", { ...healthy, exists: () => false }).every(
      (check) => check.ok,
    ),
    true,
  );
});
test("supported native environment passes", () => {
  assert.equal(
    preflight("all", healthy).every((check) => check.ok),
    true,
  );
});
test("every missing tool has an actionable correction", () => {
  const checks = preflight("all", {
    ...healthy,
    node: "22.0.0",
    exists: () => false,
    run: () => ({ ok: false, text: "" }),
  });
  assert.equal(checks.filter((check) => !check.ok).length >= 10, true);
  assert.equal(
    checks.every((check) => check.ok || check.fix.length > 20),
    true,
  );
});
test("iOS on Linux fails without invoking Xcode", () => {
  const commands = [];
  const checks = preflight("ios", {
    ...healthy,
    platform: "linux",
    run: (command) => {
      commands.push(command);
      return healthy.run(command);
    },
  });
  assert.equal(checks.find((check) => check.name === "macOS").ok, false);
  assert.deepEqual(commands, ["npm"]);
});
test("unauthorized Android device does not pass", () => {
  const checks = preflight("android", {
    ...healthy,
    run: (command) =>
      command.endsWith("adb")
        ? { ok: true, text: "phone\tunauthorized\n" }
        : healthy.run(command),
  });
  assert.equal(checks.at(-1).ok, false);
});
test("rejects misspelled targets", () => {
  assert.throws(() => preflight("andriod", healthy), /Choose/);
});
