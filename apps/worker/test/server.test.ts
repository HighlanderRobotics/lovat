import { expect, test } from "bun:test";
import { createHealthApp, healthPort } from "../src/server";

test("health requires a ready planner and a working database without exposing errors", async () => {
  let ready = false;
  let available = true;
  let checks = 0;

  const app = createHealthApp({
    isReady: () => ready,
    checkDatabase: async () => {
      checks++;
      if (!available) throw new Error("private connection details");
    },
  });

  expect((await app.request("/health")).status).toBe(503);
  expect(checks).toBe(0);

  ready = true;
  expect((await app.request("/health")).status).toBe(200);

  available = false;
  const failed = await app.request("/health");
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ status: "unavailable" });
});

test("validates the health listener port", () => {
  expect(healthPort("8080")).toBe(8080);
  expect(() => healthPort("0")).toThrow("PORT");
  expect(() => healthPort("65536")).toThrow("PORT");
  expect(() => healthPort("invalid")).toThrow("PORT");
});
