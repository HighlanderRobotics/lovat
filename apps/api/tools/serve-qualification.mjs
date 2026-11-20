import { createInterface } from "node:readline";
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  process.env.LOVAT_LOCAL_QUALIFICATION !== "1"
)
  throw Error("Use the rollout qualification runner");
const database = new URL(process.env.DATABASE_URL ?? "");
const redis = new URL(process.env.REDIS_URL ?? "");
if (
  database.hostname !== "127.0.0.1" ||
  database.pathname !== "/lovat_test" ||
  redis.hostname !== "127.0.0.1"
)
  throw Error("Use disposable loopback services");
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw Error("External providers are disabled during local qualification");
  return originalFetch(input, init);
};
const { runtime } = await import("../dist/server.js");
console.log(JSON.stringify({ type: "ready", url: runtime.url }));
const commands = createInterface({ input: process.stdin });
commands.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "stop") {
    process.emit("SIGTERM");
    commands.close();
  }
});
