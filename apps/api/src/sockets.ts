import type { Server } from "node:http";
import type { PrismaClient } from "@lovat/db";
import { WebSocketServer, WebSocket } from "ws";
import { trainingSocketCredentialsSchema } from "@lovat/api";
import { readTraining, trainingSnapshot } from "./services/training.js";
type Credentials = { sessionUuid: string; token: string; attemptUuid?: string };
export function attachTrainingSockets(
  server: Server,
  db: PrismaClient,
  origins: readonly string[],
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2048,
    perMessageDeflate: false,
  });
  const groups = new Map<
    string,
    {
      credentials: Credentials;
      clients: Set<WebSocket>;
      busy: boolean;
      lastBeat: number;
    }
  >();
  const sockets = new Map<WebSocket, { lastPong: number; ip: string }>();
  const counts = new Map<string, number>();
  server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    if (
      ![
        "/collection/training/socket",
        "/v2/collection/training/socket",
      ].includes(request.url ?? "") ||
      (origin && !origins.includes(origin)) ||
      wss.clients.size >= 200
    ) {
      socket.destroy();
      return;
    }
    const ip = request.socket.remoteAddress ?? "unknown";
    if ((counts.get(ip) ?? 0) >= 20) {
      socket.destroy();
      return;
    }
    counts.set(ip, (counts.get(ip) ?? 0) + 1);
    socket.once("close", () => {
      const count = (counts.get(ip) ?? 1) - 1;
      if (count) counts.set(ip, count);
      else counts.delete(ip);
    });
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit("connection", ws, request),
    );
  });
  wss.on("connection", (ws, request) => {
    const timeout = setTimeout(
      () => ws.close(1008, "Authentication required"),
      5000,
    );
    sockets.set(ws, {
      lastPong: Date.now(),
      ip: request.socket.remoteAddress ?? "",
    });
    ws.on("pong", () => {
      const entry = sockets.get(ws);
      if (entry) entry.lastPong = Date.now();
    });
    let groupKey: string | undefined;
    ws.once("message", async (raw) => {
      try {
        const credentials = trainingSocketCredentialsSchema.parse(
          JSON.parse(raw.toString()),
        );
        await readTraining(
          db,
          credentials.sessionUuid,
          credentials.token,
          credentials.attemptUuid,
        );
        if (ws.readyState !== WebSocket.OPEN) return;
        // Connections sharing credentials share one query and heartbeat.
        groupKey = JSON.stringify(credentials);
        let group = groups.get(groupKey);
        if (!group) {
          group = { credentials, clients: new Set(), busy: false, lastBeat: 0 };
          groups.set(groupKey, group);
        }
        group.clients.add(ws);
        clearTimeout(timeout);
        ws.send(
          JSON.stringify(
            await trainingSnapshot(
              db,
              credentials.sessionUuid,
              credentials.token,
              credentials.attemptUuid,
            ),
          ),
        );
      } catch {
        ws.close(1008, "Session unavailable");
      }
    });
    ws.on("error", () => ws.terminate());
    ws.once("close", () => {
      clearTimeout(timeout);
      sockets.delete(ws);
      if (groupKey) {
        const group = groups.get(groupKey);
        group?.clients.delete(ws);
        if (!group?.clients.size) groups.delete(groupKey);
      }
    });
  });
  const tick = setInterval(() => {
    for (const group of groups.values()) {
      if (group.busy) continue;
      group.busy = true;
      void (async () => {
        try {
          const { sessionUuid, token, attemptUuid } = group.credentials;
          const state = await trainingSnapshot(
            db,
            sessionUuid,
            token,
            attemptUuid,
          );
          if (attemptUuid && Date.now() - group.lastBeat >= 5000) {
            await db.trainingAttempt.updateMany({
              where: { uuid: attemptUuid, sessionUuid },
              data: { lastSeenAt: new Date() },
            });
            group.lastBeat = Date.now();
          }
          const message = JSON.stringify(state);
          for (const ws of group.clients) {
            if (
              Date.now() - (sockets.get(ws)?.lastPong ?? 0) > 15000 ||
              ws.bufferedAmount > 65536
            ) {
              ws.terminate();
              continue;
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.ping();
              ws.send(message);
            }
          }
        } catch {
          for (const ws of group.clients) ws.close(1008, "Session unavailable");
        } finally {
          group.busy = false;
        }
      })();
    }
  }, 1000);
  tick.unref();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(tick);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    groups.clear();
  };
  server.once("close", close);
  return { close };
}
