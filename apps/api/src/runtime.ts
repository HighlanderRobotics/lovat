import type { PrismaClient } from "@lovat/db";
import type { createApi } from "./app.js";
import { createTrainingSockets, type TrainingSocketData } from "./sockets.js";

/** Shared by production and HTTP integration tests: no Node HTTP adapter. */
export function startApi(
  api: ReturnType<typeof createApi>,
  options: {
    port: number;
    hostname?: string;
    db?: PrismaClient;
    origins?: readonly string[];
  },
) {
  const sockets = options.db
    ? createTrainingSockets(options.db, options.origins ?? [])
    : undefined;
  const server = Bun.serve<TrainingSocketData>({
    port: options.port,
    hostname: options.hostname ?? "0.0.0.0",
    maxRequestBodySize: 1024 * 1024,
    idleTimeout: 10,
    websocket: sockets?.websocket ?? { message() {} },
    fetch(request, server) {
      if (
        sockets &&
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        const result = sockets.upgrade(request, server);
        if (result !== false) return result;
      }
      return api.app.fetch(request, {
        remoteAddress: server.requestIP(request)?.address,
      });
    },
  });
  return {
    server,
    url: server.url.href.replace(/\/$/, ""),
    async stop(force = false) {
      api.drain();
      sockets?.close();
      await server.stop(force);
    },
  };
}
