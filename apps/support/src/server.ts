// Imported first so config validation runs before @lovat/db, which constructs
// its Prisma client and throws when DATABASE_URL is missing.
import { config } from "./config";
import { app } from "./app";

export default {
  hostname: "0.0.0.0",
  port: config.port,
  fetch: app.fetch,
};
