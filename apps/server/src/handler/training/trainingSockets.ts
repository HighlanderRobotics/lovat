import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import z from "zod";
import db from "../../prismaClient.js";
import { snapshot, TrainingError } from "./sessionService.js";
import { trainingOriginAllowed } from "./allowedOrigin.js";
import { reportError, runBackgroundTask } from "../../lib/errors.js";

const isExpectedSessionError = (error: unknown): boolean =>
  error instanceof TrainingError && error.status >= 400 && error.status < 500;

export function attachTrainingSockets(server: Server): {
  close(): Promise<void>;
  terminate(): void;
} {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  let draining = false;
  let activeUpdates = 0;
  const updateWaiters: (() => void)[] = [];
  const counts = new Map<string, number>();
  server.on("upgrade", (req, socket, head) => {
    if (draining || req.url !== "/collection/training/socket") {
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
      // Each accepted connection increments this entry and releases it once.
      const count = counts.get(ip)! - 1;
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
          if (draining || busy || ws.readyState !== WebSocket.OPEN) {
            return;
          }
          busy = true;
          activeUpdates += 1;
          try {
            if (Date.now() - lastPong > 15_000) {
              ws.terminate();
              return;
            }
            ws.ping();
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
          } catch (error) {
            if (!isExpectedSessionError(error)) {
              reportError(error, "Training socket update failed");
            }
            ws.close(1008, "Session unavailable");
          } finally {
            busy = false;
            activeUpdates -= 1;
            if (activeUpdates === 0) {
              updateWaiters.splice(0).forEach((resolve) => resolve());
            }
          }
        };
        await send();
        clearTimeout(timeout);
        if (!draining && ws.readyState === WebSocket.OPEN) {
          poll = setInterval(() => {
            void runBackgroundTask(send, "Training socket polling failed");
          }, 1000);
        }
      } catch (error) {
        if (
          !(error instanceof SyntaxError) &&
          !(error instanceof z.ZodError) &&
          !isExpectedSessionError(error)
        ) {
          reportError(error, "Training socket authentication failed");
        }
        ws.close(1008, "Invalid session credentials");
      }
    });
    ws.once("close", () => {
      clearTimeout(timeout);
      clearInterval(poll);
    });
    ws.on("error", (error) => {
      reportError(error, "Training socket connection failed");
      ws.close();
    });
  });
  server.once("close", () => {
    // HTTP close does not wait for upgraded sockets. During process shutdown
    // the controller owns their close handshake and deadline.
    if (!draining) {
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close();
    }
  });
  return {
    close: () => {
      draining = true;
      for (const client of wss.clients) {
        client.close(1001, "Server restarting");
      }
      const updatesDone =
        activeUpdates === 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => updateWaiters.push(resolve));
      const clientsDone = new Promise<void>((resolve) =>
        wss.close(() => resolve()),
      );
      return Promise.all([updatesDone, clientsDone]).then(() => undefined);
    },
    terminate: () => {
      draining = true;
      for (const client of wss.clients) {
        client.terminate();
      }
    },
  };
}
