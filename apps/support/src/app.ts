import { Hono } from "hono";

export const app = new Hono();

app.get("/status", (c) => {
  return c.text("Server running", 200);
});
