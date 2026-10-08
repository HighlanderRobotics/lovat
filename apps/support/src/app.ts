import { Hono } from "hono";
import routes from "./routes";

export const app = new Hono();

app.route("/v1", routes);
app.get("/status", (c) => {
  return c.text("Server running", 200);
});
