import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  origin: vi.fn(),
  heartbeat: vi.fn(),
  servers: [] as {
    handleUpgrade: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("../src/prismaClient.js", () => ({
  default: { trainingAttempt: { updateMany: mocks.heartbeat } },
}));
vi.mock("../src/handler/training/sessionService.js", () => ({
  snapshot: mocks.snapshot,
}));
vi.mock("../src/handler/training/allowedOrigin.js", () => ({
  trainingOriginAllowed: mocks.origin,
}));
vi.mock("ws", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  return {
    WebSocket: { OPEN: 1 },
    WebSocketServer: class extends Emitter {
      clients = new Set();
      close = vi.fn();
      handleUpgrade = vi.fn((_req, transport, _head, callback) => {
        this.clients.add(transport.client);
        callback(transport.client);
      });
      constructor() {
        super();
        mocks.servers.push(this);
      }
    },
  };
});
import { attachTrainingSockets } from "../src/handler/training/trainingSockets.js";

class Client extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  ping = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.emit("close");
  });
  terminate = vi.fn(() => {
    this.readyState = 3;
    this.emit("close");
  });
}
const credentials = {
  sessionUuid: "00000000-0000-4000-8000-000000000001",
  token: "s".repeat(43),
};
let server: EventEmitter;
function connect(options: { url?: string; ip?: string | null } = {}) {
  const client = new Client();
  const transport = Object.assign(new EventEmitter(), {
    destroy: vi.fn(),
    client,
  });
  server.emit(
    "upgrade",
    {
      url: options.url ?? "/collection/training/socket",
      headers: { origin: "https://example.test" },
      socket: {
        remoteAddress:
          options.ip === null ? undefined : (options.ip ?? "127.0.0.1"),
      },
    },
    transport,
    Buffer.alloc(0),
  );
  return { client, transport };
}
async function authenticate(client: Client, value: unknown = credentials) {
  const listener = client.listeners("message")[0] as (
    raw: Buffer,
  ) => Promise<void>;
  await listener(
    Buffer.from(typeof value === "string" ? value : JSON.stringify(value)),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
  vi.clearAllMocks();
  mocks.servers.length = 0;
  mocks.origin.mockReturnValue(true);
  mocks.snapshot.mockResolvedValue({ status: "LOBBY" });
  mocks.heartbeat.mockResolvedValue({ count: 1 });
  server = new EventEmitter();
  attachTrainingSockets(server as Server);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Training socket connections", () => {
  it("rejects unrelated paths and untrusted origins", () => {
    expect(connect({ url: "/other" }).transport.destroy).toHaveBeenCalledOnce();
    mocks.origin.mockReturnValue(false);
    expect(connect().transport.destroy).toHaveBeenCalledOnce();
    expect(mocks.servers[0].handleUpgrade).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", null])(
    "limits connections for address %s and frees closed slots",
    (ip) => {
      const connections = Array.from({ length: 100 }, () => connect({ ip }));
      expect(connect({ ip }).transport.destroy).toHaveBeenCalledOnce();
      for (const connection of connections) {
        connection.transport.emit("close");
      }
      expect(connect({ ip }).transport.destroy).not.toHaveBeenCalled();
    },
  );
  it("requires credentials within five seconds", async () => {
    const { client } = connect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.close).toHaveBeenCalledWith(1008, "Authentication required");
  });
  it.each(["{bad json", {}, { ...credentials, token: "short" }])(
    "rejects malformed credentials %j",
    async (value) => {
      const { client } = connect();
      await authenticate(client, value);
      expect(client.close).toHaveBeenCalledWith(
        1008,
        "Invalid session credentials",
      );
      expect(mocks.snapshot).not.toHaveBeenCalled();
    },
  );
  it("closes sessions that become unavailable", async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error("expired"));
    const { client } = connect();
    await authenticate(client);
    expect(client.close).toHaveBeenCalledWith(1008, "Session unavailable");
    await vi.advanceTimersByTimeAsync(6000);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
  });
  it("sends browser snapshots each second without participant heartbeats", async () => {
    const { client } = connect();
    await authenticate(client);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.send).toHaveBeenCalledTimes(3);
    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({ status: "LOBBY" }),
    );
    expect(mocks.heartbeat).not.toHaveBeenCalled();
    client.emit("error", new Error("broken connection"));
    expect(client.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.send).toHaveBeenCalledTimes(3);
  });
  it("updates a participant heartbeat at most once per five seconds", async () => {
    const { client } = connect();
    const attemptUuid = "00000000-0000-4000-8000-000000000002";
    await authenticate(client, { ...credentials, attemptUuid });
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.heartbeat).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
    expect(mocks.heartbeat).toHaveBeenLastCalledWith({
      where: { uuid: attemptUuid, sessionUuid: credentials.sessionUuid },
      data: { lastSeenAt: expect.any(Date) },
    });
  });
  it("keeps responding clients alive and terminates stale clients", async () => {
    const { client } = connect();
    await authenticate(client);
    await vi.advanceTimersByTimeAsync(15000);
    client.emit("pong");
    await vi.advanceTimersByTimeAsync(15000);
    expect(client.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.terminate).toHaveBeenCalledOnce();
  });
  it("skips overlapping snapshot requests", async () => {
    const { client } = connect();
    await authenticate(client);
    let resolve!: (state: object) => void;
    mocks.snapshot.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    resolve({ status: "PLAYING" });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.send).toHaveBeenLastCalledWith(
      JSON.stringify({ status: "PLAYING" }),
    );
  });
  it("does not poll a socket that is no longer open", async () => {
    const { client } = connect();
    await authenticate(client);
    client.readyState = 2;
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
  });
  it("skips authentication snapshots if the socket closed first", async () => {
    const { client } = connect();
    client.readyState = 3;
    await authenticate(client);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("terminates connected clients when the HTTP server closes", () => {
    const { client } = connect();
    server.emit("close");
    expect(client.terminate).toHaveBeenCalledOnce();
    expect(mocks.servers[0].close).toHaveBeenCalledOnce();
  });
});
