import { createApi } from "./app.js";
import { createAuthenticator } from "./auth.js";
import { createRepository } from "./repository.js";

const issuer = process.env.AUTH0_ISSUER;
const audience = process.env.AUTH0_AUDIENCE;
if (!issuer || !audience) {
  throw new Error("AUTH0_ISSUER and AUTH0_AUDIENCE are required");
}
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid PORT");
}

// Only the executable entrypoint imports the connection-owning database package.
const { createDb } = await import("@lovat/db");
const db = createDb(process.env.DATABASE_URL, {
  maxConnections: 4,
  idleTimeoutMs: 30_000,
  statementTimeoutMs: 8_000,
});
const repository = createRepository(db);
const api = createApi({
  repository,
  authenticate: createAuthenticator(repository, { issuer, audience }),
  ready: async () => {
    try {
      await db.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
  origins: (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  log: (event) => console.log(JSON.stringify(event)),
});
api.server.listen(port, () =>
  console.log(JSON.stringify({ event: "listening", port })),
);
let stopping = false;
function shutdown() {
  if (stopping) {
    return;
  }
  stopping = true;
  api.drain();
  const deadline = setTimeout(() => {
    api.server.closeAllConnections();
    process.exit(1);
  }, 15_000);
  deadline.unref();
  api.server.close(() => {
    void db.$disconnect().then(
      () => {
        clearTimeout(deadline);
      },
      () => process.exit(1),
    );
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
