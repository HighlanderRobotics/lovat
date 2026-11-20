import assert from "node:assert/strict";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3001");
if (base.hostname !== "127.0.0.1")
  throw Error("Smoke tests require a loopback container");
let ready = false;
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL("/health/ready", base), {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* The process may still be starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(ready, true, "Container never became ready");
assert.equal((await fetch(new URL("/health/live", base))).status, 200);
const games = await (await fetch(new URL("/v3/games", base))).json();
assert.ok(games.some((game) => game.id === "frc-2026" && game.version === 1));
assert.equal((await fetch(new URL("/v3/metrics", base))).status, 401);
console.log(
  "Container readiness, game catalog and authentication smoke checks passed",
);
