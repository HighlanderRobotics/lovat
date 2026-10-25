import express from "express";
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import "./loadEnv.js";

import { setupExpressErrorHandler } from "posthog-node";
import { posthog } from "./posthogClient.js";
import posthogReporter from "./lib/middleware/posthogMiddleware.js";

import routes from "./routes/index.js";
import path from "path";
import { getVersion } from "./handler/manager/version.js";

export const app = express();

setupExpressErrorHandler(posthog, app);
app.set("trust proxy", 1);

// Compress responses for clients that advertise support (Accept-Encoding: gzip)
app.use(compression());

// CORS rules
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "development"
        ? /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
        : [
            /^https:\/\/(.*\.)?lovat\.app$/,
            ...(process.env.CORS_ALLOWED_ORIGINS ?? "")
              .split(",")
              .map((origin) => origin.trim())
              .filter((origin) =>
                /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin),
              ),
          ], // Explicit preview origins; never allow every Railway domain.
  }),
);

app.use(bodyParser.json());

app.use(express.static(path.resolve("public")));

// Logs requests using posthog
app.use(posthogReporter);

// API entry point
app.use(
  "/v1",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  routes,
);

app.get("/status", (req, res) => {
  res.status(200).send("Server running");
});

app.get("/version", getVersion);
