import { Pool } from "pg";
import type { PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const transientConnectionCodes = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "57P03",
]);

/** Only acquire a connection again: never replay a statement or transaction. */
export async function acquireConnection<T>(
  connect: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const delays = [250, 750];
  for (let attempt = 0; ; attempt++) {
    try {
      return await connect();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const delay = delays[attempt];
      if (delay === undefined || !transientConnectionCodes.has(code))
        throw error;
      console.info(
        JSON.stringify({
          event: "database.connection_retry",
          code,
          attempt: attempt + 1,
          delayMs: delay,
        }),
      );
      await wait(delay);
    }
  }
}

function createRetryPool(config: PoolConfig) {
  const pool = new Pool(config);
  const connect = pool.connect.bind(pool);
  type Callback = Parameters<Pool["connect"]>[0];
  pool.connect = ((callback?: Callback) => {
    const pending = acquireConnection(() => connect());
    if (!callback) return pending;
    void pending.then(
      (client) => callback(undefined, client, client.release.bind(client)),
      (error: Error) => callback(error, undefined, () => {}),
    );
  }) as Pool["connect"];
  return pool;
}

/** Create a fresh owned pool on reconnect, including after a batch disconnect. */
export class ConnectionRetryAdapter extends PrismaPg {
  constructor(private readonly poolConfig: PoolConfig) {
    super(poolConfig);
  }

  override connect(): ReturnType<PrismaPg["connect"]> {
    return new PrismaPg(createRetryPool(this.poolConfig), {
      disposeExternalPool: true,
    }).connect();
  }
}
