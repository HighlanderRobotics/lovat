import type { Server } from "node:http";

interface ShutdownDependencies {
  server: Pick<Server, "close" | "closeAllConnections">;
  health: { stop(): void };
  sockets: { close(): Promise<void>; terminate(): void };
  stopWork?: () => void;
  cleanup: (() => Promise<unknown>)[];
  exit: (code: number) => void;
  timeoutMs?: number;
}

/** Stop admission immediately, drain active work, then close shared clients. */
export function createShutdown({
  server,
  health,
  sockets,
  stopWork = () => undefined,
  cleanup,
  exit,
  timeoutMs = 10_000,
}: ShutdownDependencies): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  return () => {
    if (stopping) {
      return stopping;
    }
    health.stop();
    stopWork();
    stopping = new Promise<void>((resolve) => {
      let finished = false;
      const finish = (code: number) => {
        if (!finished) {
          finished = true;
          exit(code);
          resolve();
        }
      };
      const deadline = setTimeout(() => {
        sockets.terminate();
        server.closeAllConnections();
        console.error("Server shutdown timed out");
        finish(1);
      }, timeoutMs);
      let socketsClosed: Promise<void>;
      try {
        socketsClosed = sockets.close();
      } catch (error) {
        socketsClosed = Promise.reject(error);
      }
      const httpClosed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      void Promise.allSettled([httpClosed, socketsClosed]).then(
        async (drained) => {
          const results = await Promise.allSettled(
            cleanup.map((close) => Promise.resolve().then(close)),
          );
          clearTimeout(deadline);
          const failed = [...drained, ...results].some(
            (result) => result.status === "rejected",
          );
          if (failed) {
            console.error("Server shutdown cleanup failed");
          }
          finish(failed ? 1 : 0);
        },
      );
    });
    return stopping;
  };
}
