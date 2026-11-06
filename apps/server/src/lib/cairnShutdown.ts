import type { Server } from "node:http";

// Register only when collection is enabled; the default process behavior is unchanged.
export function installCairnShutdown(
  server: Server,
  reporter: {
    enabled: boolean;
    shutdown: (timeoutMs?: number) => Promise<void>;
  },
  runtime = process,
): void {
  if (!reporter.enabled) {
    return;
  }

  let stopping = false;
  const stop = () => {
    if (stopping) {
      return;
    }
    stopping = true;

    const deadline = setTimeout(() => {
      server.closeAllConnections();
      runtime.exit(0);
    }, 5000);

    server.close(() => {
      const finish = () => {
        clearTimeout(deadline);
        runtime.exit(0);
      };
      void reporter.shutdown(1000).then(finish, finish);
    });
  };

  runtime.once("SIGTERM", stop);
  runtime.once("SIGINT", stop);
}
