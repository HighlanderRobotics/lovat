import { Hono } from "hono";
import { analysisEventAllowed, controlAuthorized } from "./ocr/event-control";

export function createHealthApp({
  isReady,
  checkDatabase,
  ocr,
}: {
  isReady: () => boolean;
  checkDatabase: () => Promise<void>;
  ocr?: {
    token?: string;
    enqueue: (event: string) => Promise<unknown>;
    status: (event: string) => Promise<unknown>;
  };
}) {
  const app = new Hono();
  app.onError((_error, c) => c.json({ error: "Service unavailable" }, 503));

  app.get("/health", async (c) => {
    if (!isReady()) return c.json({ status: "unavailable" }, 503);

    try {
      await checkDatabase();
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });

  if (ocr) {
    app.use("/ocr/*", async (c, next) => {
      if (!controlAuthorized(c.req.header("Authorization"), ocr.token))
        return c.json({ error: "Unauthorized" }, 401);
      await next();
    });
    app.post("/ocr/events/:event", async (c) => {
      const key = c.req.param("event");
      if (!analysisEventAllowed(key))
        return c.json({ error: "Event is not enabled" }, 400);
      const body = await c.req.text();
      if (body.length > 256 || (body.trim() && body.trim() !== "{}"))
        return c.json({ error: "No request options are supported" }, 400);
      return c.json(await ocr.enqueue(key), 202);
    });
    app.get("/ocr/events/:event", async (c) => {
      const key = c.req.param("event");
      if (!analysisEventAllowed(key))
        return c.json({ error: "Event is not enabled" }, 400);
      return c.json(await ocr.status(key));
    });
  }
  return app;
}

export function healthPort(value = process.env.PORT ?? "8080") {
  const port = Number(value);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}
