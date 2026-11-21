import express from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { errorResponses } from "../src/lib/errors.js";

const app = express();
app.use(errorResponses);
app.get("/missing-match", (_req, res) =>
  res.status(404).send("MATCH_NOT_FOUND"),
);
app.get("/missing-schedule", (_req, res) =>
  res.status(400).json({
    code: "MATCHES_NOT_AVAILABLE",
    error: "Matches are not available for this tournamnet",
    displayError: "Matches are not available for this tournament",
  }),
);

it.each([undefined, "unknown"])(
  "preserves installed clients' missing-match sentinel for %s",
  async (format) => {
    const call = request(app).get("/missing-match");
    if (format) call.set("X-Lovat-Error-Format", format);
    const res = await call;
    expect(res.status).toBe(404);
    expect(res.text).toBe("MATCH_NOT_FOUND");
    expect(res.headers.vary).toContain("X-Lovat-Error-Format");
  },
);
it("preserves the legacy missing-schedule error key and spelling", async () => {
  const res = await request(app).get("/missing-schedule");
  expect(res.body.error).toBe("Matches are not available for this tournamnet");
});
it("provides the uniform contract only after the client opts in", async () => {
  const res = await request(app)
    .get("/missing-match")
    .set("X-Lovat-Error-Format", "json-v1");
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({
    code: "MATCH_NOT_FOUND",
    message: "MATCH_NOT_FOUND",
    displayError: "MATCH_NOT_FOUND",
  });
  const schedule = await request(app)
    .get("/missing-schedule")
    .set("X-Lovat-Error-Format", "json-v1");
  expect(schedule.body.code).toBe("MATCHES_NOT_AVAILABLE");
  expect(schedule.body.displayError).toBe(
    "Matches are not available for this tournament",
  );
});
