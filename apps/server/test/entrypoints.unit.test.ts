import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  exercise: vi.fn(),
  schedule: vi.fn(),
  connect: vi.fn(),
  closeRedis: vi.fn(),
  healthStart: vi.fn(),
  healthStop: vi.fn(),
  posthogShutdown: vi.fn(),
  clear: vi.fn(),
  listen: vi.fn(),
  create: vi.fn(),
  disconnect: vi.fn(),
  sockets: vi.fn(),
  socketController: { close: vi.fn(), terminate: vi.fn() },
  server: { on: vi.fn(), close: vi.fn(), closeAllConnections: vi.fn() },
}));
vi.mock("../src/handler/training/builtInExercise.js", () => ({
  ensureBuiltInTrainingExercise: mocks.exercise,
}));
vi.mock("../src/handler/training/trainingSockets.js", () => ({
  attachTrainingSockets: mocks.sockets,
}));
vi.mock("../src/app.js", () => ({ app: { listen: mocks.listen } }));
vi.mock("../src/lib/scheduleJobs.js", () => ({ default: mocks.schedule }));
vi.mock("../src/redisClient.js", () => ({
  connectRedis: mocks.connect,
  closeRedis: mocks.closeRedis,
}));
vi.mock("../src/lib/runtimeHealth.js", () => ({
  runtimeHealth: { start: mocks.healthStart, stop: mocks.healthStop },
}));
vi.mock("../src/posthogClient.js", () => ({
  posthog: { shutdown: mocks.posthogShutdown },
}));
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
  vi.spyOn(process, "on").mockReturnValue(process);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.sockets.mockReturnValue(mocks.socketController);
  mocks.socketController.close.mockResolvedValue(undefined);
  mocks.server.close.mockImplementation((callback) => callback());
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.closeRedis.mockResolvedValue(undefined);
  mocks.posthogShutdown.mockResolvedValue(undefined);
  mocks.listen.mockImplementation((_port, callback) => {
    callback();
    return mocks.server;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.each([undefined, "4321"])(
  "schedules and connects Redis before listening on the configured port (%s)",
  async (port) => {
    vi.stubEnv("PORT", port);
    await import("../src/server.js");
    expect(mocks.sockets).toHaveBeenCalledWith(mocks.server);
    expect(mocks.healthStart).toHaveBeenCalledOnce();
    const signalCalls = vi
      .mocked(process.on)
      .mock.calls.filter(
        ([signal]) => signal === "SIGTERM" || signal === "SIGINT",
      );
    expect(signalCalls).toHaveLength(2);
    expect(signalCalls[0][1]).toBe(signalCalls[1][1]);
    expect(mocks.exercise).toHaveBeenCalledOnce();
    expect(mocks.exercise.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.schedule.mock.invocationCallOrder[0],
    );
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.listen).toHaveBeenCalledWith(
      port ?? 3000,
      expect.any(Function),
    );
    expect(mocks.schedule.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.connect.mock.invocationCallOrder[0],
    );
    expect(mocks.connect.mock.invocationCallOrder[0]).toBeLessThan(
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

it("does not listen or schedule work if the built-in exercise conflicts", async () => {
  mocks.exercise.mockRejectedValue(new Error("exercise conflict"));
  await expect(import("../src/server.js")).rejects.toThrow("exercise conflict");
  expect(mocks.schedule).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.listen).not.toHaveBeenCalled();
});

it.each(["SIGTERM", "SIGINT"])(
  "closes shared clients when %s arrives",
  async (signal) => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    await import("../src/server.js");
    const listener = vi
      .mocked(process.on)
      .mock.calls.find(([event]) => event === signal)![1];
    await listener();
    expect(mocks.healthStop).toHaveBeenCalledOnce();
    expect(mocks.server.close).toHaveBeenCalledOnce();
    expect(mocks.socketController.close).toHaveBeenCalledOnce();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.closeRedis).toHaveBeenCalledOnce();
    expect(mocks.posthogShutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  },
);
