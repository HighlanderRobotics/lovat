import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import type { PrismaClient } from "@lovat/db";
import { trainingSocketCredentialsSchema } from "@lovat/api";
import { readTraining, trainingSnapshot } from "./services/training.js";
type Credentials = { sessionUuid: string; token: string; attemptUuid?: string };
export type TrainingSocketData = {
  ip: string;
  authenticating?: boolean;
  groupKey?: string;
  lastPong: number;
  timeout?: ReturnType<typeof setTimeout>;
};
type Socket = ServerWebSocket<TrainingSocketData>;
export function createTrainingSockets(
  db: PrismaClient,
  origins: readonly string[],
) {
  const clients = new Set<Socket>();
  const counts = new Map<string, number>();
  const groups = new Map<
    string,
    {
      credentials: Credentials;
      clients: Set<Socket>;
      busy: boolean;
      lastBeat: number;
    }
  >();
  let closed = false;
  const websocket: WebSocketHandler<TrainingSocketData> = {
    maxPayloadLength: 2048,
    perMessageDeflate: false,
    idleTimeout: 15,
    backpressureLimit: 65536,
    closeOnBackpressureLimit: true,
    open(ws) {
      clients.add(ws);
      ws.data.timeout = setTimeout(
        () => ws.close(1008, "Authentication required"),
        5000,
      );
    },
    pong(ws) {
      ws.data.lastPong = Date.now();
    },
    async message(ws, raw) {
      if (ws.data.groupKey || ws.data.authenticating) return;
      ws.data.authenticating = true;
      try {
        const credentials = trainingSocketCredentialsSchema.parse(
          JSON.parse(typeof raw === "string" ? raw : raw.toString()),
        );
        await readTraining(
          db,
          credentials.sessionUuid,
          credentials.token,
          credentials.attemptUuid,
        );
        if (!clients.has(ws) || closed) return;
        const key = JSON.stringify(credentials);
        let group = groups.get(key);
        if (!group) {
          group = { credentials, clients: new Set(), busy: false, lastBeat: 0 };
          groups.set(key, group);
        }
        ws.data.groupKey = key;
        group.clients.add(ws);
        clearTimeout(ws.data.timeout);
        const snapshot = await trainingSnapshot(
          db,
          credentials.sessionUuid,
          credentials.token,
          credentials.attemptUuid,
        );
        if (clients.has(ws)) ws.send(JSON.stringify(snapshot));
      } catch {
        ws.close(1008, "Session unavailable");
      }
    },
    close(ws) {
      clearTimeout(ws.data.timeout);
      clients.delete(ws);
      const count = (counts.get(ws.data.ip) ?? 1) - 1;
      if (count) counts.set(ws.data.ip, count);
      else counts.delete(ws.data.ip);
      if (ws.data.groupKey) {
        const group = groups.get(ws.data.groupKey);
        group?.clients.delete(ws);
        if (!group?.clients.size) groups.delete(ws.data.groupKey);
      }
    },
  };
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
            if (Date.now() - ws.data.lastPong > 15000) {
              ws.terminate();
              continue;
            }
            ws.ping();
            ws.send(message);
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
  return {
    websocket,
    upgrade(
      request: Request,
      server: Server<TrainingSocketData>,
    ): Response | undefined | false {
      if (
        ![
          "/collection/training/socket",
          "/v2/collection/training/socket",
        ].includes(new URL(request.url).pathname)
      )
        return false;
      const origin = request.headers.get("origin");
      const ip = server.requestIP(request)?.address ?? "unknown";
      if (closed || (origin && !origins.includes(origin)))
        return new Response("Forbidden", { status: 403 });
      if (clients.size >= 200 || (counts.get(ip) ?? 0) >= 20)
        return new Response("Too many connections", { status: 503 });
      if (server.upgrade(request, { data: { ip, lastPong: Date.now() } })) {
        counts.set(ip, (counts.get(ip) ?? 0) + 1);
        return undefined;
      }
      return new Response("WebSocket upgrade required", { status: 426 });
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(tick);
      for (const ws of clients) ws.terminate();
      groups.clear();
    },
  };
}
