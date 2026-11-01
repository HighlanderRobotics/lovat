import { afterEach, describe, expect, it, vi } from "vitest";
import { trainingOriginAllowed } from "../src/handler/training/allowedOrigin.js";

afterEach(() => vi.unstubAllEnvs());

describe("training WebSocket origins", () => {
  const env = {
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: " https://dashboard-lovat-pr-93.up.railway.app , ",
    RAILWAY_SERVICE_WEBSITE_URL: "website-lovat-pr-93.up.railway.app",
    RAILWAY_PUBLIC_DOMAIN: "api-lovat-pr-93.up.railway.app",
  };

  it.each([
    undefined,
    "https://lovat.app",
    "https://www.lovat.app",
    "https://dashboard-lovat-pr-93.up.railway.app",
    "https://website-lovat-pr-93.up.railway.app",
    "https://api-lovat-pr-93.up.railway.app",
  ])("allows the configured browser/native origin %s", (origin) => {
    expect(trainingOriginAllowed(origin, env)).toBe(true);
  });

  it.each([
    "null",
    "not-a-url",
    "https://evil.example",
    "https://lovat.app.evil.example",
    "https://unrelated.up.railway.app",
    "http://website-lovat-pr-93.up.railway.app",
    "https://user@lovat.app",
    "https://lovat.app/path",
    "http://localhost:5183",
  ])("rejects untrusted origin %s", (origin) => {
    expect(trainingOriginAllowed(origin, env)).toBe(false);
  });

  it("supports local development without enabling it in production", () => {
    expect(
      trainingOriginAllowed("http://localhost:5183", {
        NODE_ENV: "development",
      }),
    ).toBe(true);
    expect(
      trainingOriginAllowed("http://127.0.0.1:5183", {
        NODE_ENV: "development",
      }),
    ).toBe(true);
    expect(
      trainingOriginAllowed("http://elsewhere:5183", {
        NODE_ENV: "development",
      }),
    ).toBe(false);
  });

  it("reads explicit HTTPS origins from the runtime environment", () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "broken://[, https://preview.example");
    expect(trainingOriginAllowed("https://preview.example")).toBe(true);
    expect(trainingOriginAllowed("https://not-configured.example", {})).toBe(
      false,
    );
  });
});
