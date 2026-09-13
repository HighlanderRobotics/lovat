import { Hono } from "hono";

export const app = new Hono();

app.set("trust proxy", true);

// Compress responses for clients that advertise support (Accept-Encoding: gzip)
app.use(compression());

// API entry point
app.use("/v1", routes);

app.get("/status", (req, res) => {
  res.status(200).send("Server running");
});
