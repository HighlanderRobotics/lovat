import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  clear: vi.fn(),
  listen: vi.fn(),
  create: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("../src/app.js", () => ({ app: { listen: mocks.listen } }));
vi.mock("../src/lib/scheduleJobs.js", () => ({ default: mocks.schedule }));
vi.mock("../src/lib/clearCache.js", () => ({ clearCache: mocks.clear }));
vi.mock("../src/prismaClient.js", () => ({
  default: {
    featureToggle: { create: mocks.create },
    $disconnect: mocks.disconnect,
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.listen.mockImplementation((_port, callback) => callback());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.each([undefined, "4321"])(
  "schedules and clears cache before listening on the configured port (%s)",
  async (port) => {
    vi.stubEnv("PORT", port);
    await import("../src/server.js");
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.listen).toHaveBeenCalledWith(
      port ?? 3000,
      expect.any(Function),
    );
    expect(mocks.schedule.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clear.mock.invocationCallOrder[0],
    );
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listen.mock.invocationCallOrder[0],
    );
  },
);
it("does not start a server when startup jobs fail", async () => {
  mocks.schedule.mockRejectedValue(new Error("offline"));
  await expect(import("../src/server.js")).rejects.toThrow("offline");
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.listen).not.toHaveBeenCalled();
});
it("disconnects after seeding the initial registration feature toggle", async () => {
  await import("../src/seed.js");
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledWith({
    data: { feature: "fullRegistration", enabled: false },
  });
});
it("disconnects and exits with failure when seeding fails", async () => {
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation(() => undefined as never);
  mocks.create.mockRejectedValue(new Error("offline"));
  await import("../src/seed.js");
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  expect(mocks.disconnect).toHaveBeenCalledOnce();
});
it.each([
  ["production", "development", "production"],
  [undefined, "test", "test"],
  [undefined, undefined, "development"],
])(
  "resolves deployment and local environments in priority order %s %s",
  async (railway, node, expected) => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", railway);
    vi.stubEnv("NODE_ENV", node);
    expect((await import("../src/lib/environment.js")).ENVIRONMENT).toBe(
      expected,
    );
  },
);
