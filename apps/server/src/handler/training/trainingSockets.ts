import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import z from "zod";
import db from "../../prismaClient.js";
import { snapshot } from "./sessionService.js";
import { trainingOriginAllowed } from "./allowedOrigin.js";

export function attachTrainingSockets(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const counts = new Map<string, number>();
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/collection/training/socket") {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (!trainingOriginAllowed(origin)) {
      socket.destroy();
      return;
    }
    const ip = req.socket.remoteAddress ?? "unknown";
    if ((counts.get(ip) ?? 0) >= 100) {
      socket.destroy();
      return;
    }
    counts.set(ip, (counts.get(ip) ?? 0) + 1);
    socket.once("close", () => {
      const count = (counts.get(ip) ?? 1) - 1;
      if (count) {
        counts.set(ip, count);
      } else {
        counts.delete(ip);
      }
    });
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    const timeout = setTimeout(
      () => ws.close(1008, "Authentication required"),
      5000,
    );
    let poll: ReturnType<typeof setInterval> | undefined;
    let lastPong = Date.now();
    ws.on("pong", () => {
      lastPong = Date.now();
    });
    ws.once("message", async (raw) => {
      try {
        const input = z
          .object({
            sessionUuid: z.uuid(),
            token: z.string().min(32).max(100),
            attemptUuid: z.uuid().optional(),
          })
          .parse(JSON.parse(raw.toString()));
        let busy = false,
          lastHeartbeat = 0;
        const send = async () => {
          if (busy || ws.readyState !== WebSocket.OPEN) {
            return;
          }
          if (Date.now() - lastPong > 15_000) {
            ws.terminate();
            return;
          }
          ws.ping();
          busy = true;
          try {
            const state = await snapshot(
              input.sessionUuid,
              input.token,
              input.attemptUuid,
            );
            if (input.attemptUuid && Date.now() - lastHeartbeat > 5000) {
              await db.trainingAttempt.updateMany({
                where: {
                  uuid: input.attemptUuid,
                  sessionUuid: input.sessionUuid,
                },
                data: { lastSeenAt: new Date() },
              });
              lastHeartbeat = Date.now();
            }
            ws.send(JSON.stringify(state));
          } catch {
            ws.close(1008, "Session unavailable");
          } finally {
            busy = false;
          }
        };
        await send();
        clearTimeout(timeout);
        if (ws.readyState === WebSocket.OPEN) {
          poll = setInterval(() => {
            void send();
          }, 1000);
        }
      } catch {
        ws.close(1008, "Invalid session credentials");
      }
    });
    ws.once("close", () => {
      clearTimeout(timeout);
      clearInterval(poll);
    });
    ws.on("error", () => ws.close());
  });
  server.once("close", () => {
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
  });
}
