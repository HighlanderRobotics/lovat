import { Hono } from "hono";

export function createHealthApp({
  isReady,
  checkDatabase,
}: {
  isReady: () => boolean;
  checkDatabase: () => Promise<void>;
}) {
  const app = new Hono();

  app.get("/health", async (c) => {
    if (!isReady()) return c.json({ status: "unavailable" }, 503);

    try {
      await checkDatabase();
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });

  return app;
}

export function healthPort(value = process.env.PORT ?? "8080") {
  const port = Number(value);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}
