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
it.each([
  ["OCR_WORKER_URL", ""],
  ["OCR_CONTROL_TOKEN", ""],
  ["OCR_CONTROL_TOKEN", "short"],
])("fails closed when %s is missing or insufficient", async (key, value) => {
  vi.stubEnv(key, value);
  vi.stubGlobal("fetch", vi.fn());
  const response = await invoke(eventAnalysisProxy, {
    params: { event: "2026casnf" },
    method: "GET",
  });
  expect(response.statusCode).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  "not a URL",
  "ftp://worker.railway.internal",
  "http://user@worker.railway.internal",
  "http://:secret@worker.railway.internal",
  "http://worker.railway.internal?token=secret",
  "http://worker.railway.internal#secret",
])("rejects unsafe worker configuration %s", async (url) => {
  vi.stubEnv("OCR_WORKER_URL", url);
  vi.stubGlobal("fetch", vi.fn());
  const response = await invoke(eventAnalysisProxy, {
    params: { event: "2026casnf" },
    method: "GET",
  });
  expect(response.statusCode).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it("supports status reads by leads and empty POST requests without forwarding user input", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ status: "RUNNING" }));
  vi.stubGlobal("fetch", fetcher);
  const response = await invoke(eventAnalysisProxy, {
    params: { event: "2026cagle" },
    method: "GET",
    user: { ...testUser, role: "SCOUTING_LEAD" },
  });
  expect(response.statusCode).toBe(200);
  expect(fetcher.mock.calls[0]?.[1].body).toBeUndefined();
  expect(
    (
      await invoke(eventAnalysisProxy, {
        params: { event: "2026casnf" },
        method: "POST",
        body: {},
      })
    ).statusCode,
  ).toBe(200);
});
it.each([401, 403, 429, 500, 503])(
  "reports upstream %i as unavailable without logging out a valid user",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private internal failure", { status }),
        ),
    );
    const response = await invoke(eventAnalysisProxy, {
      params: { event: "2026casnf" },
      method: "GET",
    });
    expect(response.statusCode).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("private");
  },
);
it("sanitizes network failures and non-JSON worker replies", async () => {
  for (const fetcher of [
    vi.fn().mockRejectedValue(Error("secret connection details")),
    vi.fn().mockResolvedValue(new Response("not JSON")),
  ]) {
    vi.stubGlobal("fetch", fetcher);
    const response = await invoke(eventAnalysisProxy, {
      params: { event: "2026casnf" },
      method: "GET",
    });
    expect(response.statusCode).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("secret");
  }
});
it("rejects unsupported account roles and handles POST without a JSON body", async () => {
  expect(
    (
      await invoke(eventAnalysisProxy, {
        params: { event: "2026casnf" },
        method: "POST",
        user: { ...testUser, role: "UNSUPPORTED" as typeof testUser.role },
      })
    ).statusCode,
  ).toBe(403);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ status: "QUEUED" }, { status: 202 })),
  );
  expect(
    (
      await invoke(eventAnalysisProxy, {
        params: { event: "2026casnf" },
        method: "POST",
        body: undefined,
      })
    ).statusCode,
  ).toBe(202);
});
