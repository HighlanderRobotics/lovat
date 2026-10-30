import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
vi.mock("../src/lib/middleware/requireAuth.js", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("../src/lib/middleware/requireVerifiedTeam.js", () => ({
  requireVerifiedTeam: vi.fn(),
}));
const { eventAnalysisProxy } =
  await import("../src/routes/manager/ocr.routes.js");
beforeEach(() => {
  vi.stubEnv("OCR_WORKER_URL", "http://worker.railway.internal:8080");
  vi.stubEnv("OCR_CONTROL_TOKEN", "x".repeat(40));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each([
  { user: { ...testUser, teamNumber: 1967 } },
  { tokenType: "apiKey" as const },
  { user: { ...testUser, teamNumber: null } },
])(
  "does not grant queue access to other teams, API keys or unaffiliated users",
  async (overrides) => {
    const response = await invoke(eventAnalysisProxy, {
      params: { event: "2026casnf" },
      method: "POST",
      ...overrides,
    });
    expect(response.statusCode).toBe(403);
  },
);
it("queues only approved events over the configured private worker URL", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ status: "QUEUED" }, { status: 202 }));
  vi.stubGlobal("fetch", fetcher);
  const response = await invoke(eventAnalysisProxy, {
    params: { event: "2026casnf" },
    method: "POST",
  });
  expect(response.statusCode).toBe(202);
  expect(fetcher).toHaveBeenCalledWith(
    new URL("http://worker.railway.internal:8080/ocr/events/2026casnf"),
    expect.objectContaining({ method: "POST", redirect: "error" }),
  );
  expect(
    (
      await invoke(eventAnalysisProxy, {
        params: { event: "2026other" },
        method: "POST",
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await invoke(eventAnalysisProxy, {
        params: { event: "2026casnf" },
        method: "POST",
        body: { url: "https://example.com" },
      })
    ).statusCode,
  ).toBe(400);
});
it("does not expose internal credentials or failures", async () => {
  vi.stubEnv("OCR_WORKER_URL", "https://external.example");
  vi.stubGlobal("fetch", vi.fn());
  const response = await invoke(eventAnalysisProxy, {
    params: { event: "2026cagle" },
    method: "GET",
  });
  expect(response.statusCode).toBe(503);
  expect(JSON.stringify(response.body)).not.toContain("external.example");
  expect(fetch).not.toHaveBeenCalled();
});
