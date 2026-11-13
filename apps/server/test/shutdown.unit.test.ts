import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createShutdown } from "../src/lib/shutdown.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  let finishHttp!: (error?: Error) => void;
  let finishSockets!: () => void;
  const server = {
    close: vi.fn((callback) => {
      finishHttp = callback;
    }),
    closeAllConnections: vi.fn(),
  } as unknown as Pick<Server, "close" | "closeAllConnections">;
  const sockets = {
    close: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSockets = resolve;
        }),
    ),
    terminate: vi.fn(),
  };
  const stop = vi.fn();
  const stopWork = vi.fn();
  const cleanup = [
    vi.fn().mockResolvedValue(undefined),
    vi.fn().mockResolvedValue(undefined),
    vi.fn().mockResolvedValue(undefined),
  ];
  const exit = vi.fn();
  const shutdown = createShutdown({
    server,
    health: { stop },
    stopWork,
    sockets,
    cleanup,
    exit,
  });
  return {
    shutdown,
    server,
    sockets,
    stop,
    stopWork,
    cleanup,
    exit,
    finishHttp: (error?: Error) => finishHttp(error),
    finishSockets: () => finishSockets(),
  };
}

it("stops admission immediately, drains HTTP and sockets, then closes every client once", async () => {
  const s = setup();
  const done = s.shutdown();
  expect(s.stop).toHaveBeenCalledOnce();
  expect(s.stopWork).toHaveBeenCalledOnce();
  expect(s.server.close).toHaveBeenCalledOnce();
  expect(s.shutdown()).toBe(done);
  await vi.advanceTimersByTimeAsync(0);
  s.finishHttp();
  await vi.advanceTimersByTimeAsync(0);
  expect(s.cleanup[0]).not.toHaveBeenCalled();
  s.finishSockets();
  await done;
  for (const close of s.cleanup) {
    expect(close).toHaveBeenCalledOnce();
  }
  expect(s.exit).toHaveBeenCalledExactlyOnceWith(0);
  expect(s.server.closeAllConnections).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("forces stuck connections closed at the deadline and never exits twice", async () => {
  const s = setup();
  const done = s.shutdown();
  await vi.advanceTimersByTimeAsync(10_000);
  await done;
  expect(s.sockets.terminate).toHaveBeenCalledOnce();
  expect(s.server.closeAllConnections).toHaveBeenCalledOnce();
  expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
  s.finishHttp();
  s.finishSockets();
  await vi.advanceTimersByTimeAsync(0);
  expect(s.exit).toHaveBeenCalledTimes(1);
});

it("closes the remaining clients after an error without logging private details", async () => {
  const s = setup();
  s.cleanup[0].mockRejectedValue(new Error("private-connection-secret"));
  const done = s.shutdown();
  await vi.advanceTimersByTimeAsync(0);
  s.finishHttp();
  s.finishSockets();
  await done;
  for (const close of s.cleanup) {
    expect(close).toHaveBeenCalledOnce();
  }
  expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    "Server shutdown cleanup failed",
  );
});

it("applies the same deadline to stuck dependency cleanup", async () => {
  const s = setup();
  s.cleanup[0].mockImplementation(() => new Promise(() => undefined));
  const done = s.shutdown();
  await vi.advanceTimersByTimeAsync(0);
  s.finishHttp();
  s.finishSockets();
  await vi.advanceTimersByTimeAsync(10_000);
  await done;
  expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("drains a real in-flight HTTP request before closing dependencies", async () => {
  vi.useRealTimers();
  const { createServer } = await import("node:http");
  let release!: () => void;
  let received!: () => void;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = createServer(async (_req, res) => {
    received();
    await gate;
    res.end("completed");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing test listener");
  }
  const url = `http://127.0.0.1:${address.port}`;
  const pending = fetch(url);
  await started;
  const cleanup = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn();
  const exit = vi.fn();
  const shutdown = createShutdown({
    server,
    health: { stop },
    sockets: {
      close: async () => undefined,
      terminate: vi.fn(),
    },
    cleanup: [cleanup],
    exit,
  });
  const done = shutdown();
  expect(stop).toHaveBeenCalledOnce();
  expect(cleanup).not.toHaveBeenCalled();
  await expect(fetch(url)).rejects.toThrow();
  release();
  expect(await (await pending).text()).toBe("completed");
  await done;
  expect(cleanup).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledExactlyOnceWith(0);
});

it("still drains HTTP and cleans up when WebSocket closing throws synchronously", async () => {
  const s = setup();
  s.sockets.close.mockImplementation(() => {
    throw new Error("private-secret");
  });
  const done = s.shutdown();
  s.finishHttp();
  await done;
  expect(s.cleanup[0]).toHaveBeenCalledOnce();
  expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    "Server shutdown cleanup failed",
  );
});

it("reports an HTTP drain failure after closing the other clients", async () => {
  const s = setup();
  const done = s.shutdown();
  s.finishHttp(new Error("private-http-error"));
  s.finishSockets();
  await done;
  expect(s.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(s.cleanup[2]).toHaveBeenCalledOnce();
});
