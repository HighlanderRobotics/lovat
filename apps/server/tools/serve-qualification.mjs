import { createInterface } from "node:readline";
// Test tooling only; this is never the deployment entrypoint.
import { once } from "node:events";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  process.env.LOVAT_LOCAL_QUALIFICATION !== "1"
) {
  throw new Error("Use the rollout qualification runner");
}
const database = new URL(process.env.DATABASE_URL ?? "");
const redis = new URL(process.env.REDIS_URL ?? "");
if (
  database.hostname !== "127.0.0.1" ||
  database.pathname !== "/lovat_test" ||
  redis.hostname !== "127.0.0.1"
) {
  throw new Error("Use disposable loopback services");
}
const local = (input) => {
  const host =
    typeof input === "string" || input instanceof URL
      ? new URL(input).hostname
      : (input.hostname ?? input.host?.split(":")[0] ?? "localhost");
  if (!["localhost", "127.0.0.1"].includes(host)) {
    throw new Error(
      "External providers are disabled during local qualification",
    );
  }
};
for (const transport of [http, https]) {
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function (input, ...rest) {
      local(input);
      return original.call(this, input, ...rest);
    };
  }
}
syncBuiltinESMExports();
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  local(input instanceof Request ? input.url : input);
  return originalFetch(input, init);
};
const { posthog } = await import("../dist/src/posthogClient.js");
await posthog.disable();
const { app } = await import("../dist/src/app.js");
const { db } = await import("@lovat/db");
const { closeRedis } = await import("../dist/src/redisClient.js");
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
console.log(
  JSON.stringify({
    type: "ready",
    url: "http://127.0.0.1:" + server.address().port,
  }),
);
const commands = createInterface({ input: process.stdin });
commands.on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.type === "stop") {
    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await posthog.shutdown();
    await db.$disconnect();
    commands.close();
  }
});
