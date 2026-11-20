import { createProvisioner } from "./provision.js";
import { startApi } from "./runtime.js";
import { createOfficialReader } from "./official.js";
import { createAnalysisService } from "./analysis.js";
import { createApi } from "./app.js";
import { accessScope } from "./auth.js";
import { createIdentityService } from "./identity.js";
import { createState } from "./state.js";
import { createSignatureVerifier } from "./signatures.js";
import { createServices } from "./services/index.js";
import { createRepository } from "./repository.js";

const issuer = process.env.AUTH0_ISSUER;
const audience = process.env.AUTH0_AUDIENCE;
if (!issuer || !audience) {
  throw new Error("AUTH0_ISSUER and AUTH0_AUDIENCE are required");
}
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
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
const state = createState(
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  process.env.REDIS_KEY_PREFIX ?? "lovat:rewrite:",
);
const identity = createIdentityService(db, {
  issuer,
  audience,
  limiter: state.limiter,
  provision: createProvisioner(db, issuer),
});
const analyze = createAnalysisService(repository, state.cache);
const services = createServices({
  slack: {
    baseUrl: process.env.BASE_URL ?? "https://api.lovat.app",
    state: state.oauth,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
  },
  analyze,
  official: createOfficialReader(process.env.TBA_KEY),
  website: process.env.LOVAT_WEBSITE ?? "https://lovat.app",
  baseUrl: process.env.BASE_URL ?? "https://api.lovat.app",
  commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? "no commit id",
});
const api = createApi({
  analyze,
  repository,
  authenticate: async (authorization) =>
    accessScope((await identity(authorization)).user),
  services: {
    limiter: state.limiter,
    router: services,
    db,
    authenticate: identity,
    verifySignature: createSignatureVerifier({
      lovatKey: process.env.LOVAT_SIGNING_KEY,
      slackSecret: process.env.SLACK_SIGNING_SECRET,
    }),
  },
  ready: async () => {
    try {
      await db.$queryRaw`SELECT 1`;
      return await state.ready();
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
export const runtime = startApi(api, {
  port,
  hostname: process.env.HOST ?? "0.0.0.0",
  db,
  origins: (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});
console.log(
  JSON.stringify({
    event: "listening",
    port: runtime.server.port,
    runtime: "bun",
  }),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  api.drain();
  const deadline = setTimeout(() => {
    void runtime.stop(true);
    process.exit(1);
  }, 15000);
  deadline.unref();
  try {
    await runtime.stop();
    await Promise.all([db.$disconnect(), state.close()]);
    clearTimeout(deadline);
  } catch {
    process.exit(1);
  }
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
