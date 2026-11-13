import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export interface DbPoolOptions {
  maxConnections?: number;
  statementTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export function createDb(
  connectionString = process.env.DATABASE_URL,
  options: DbPoolOptions = {},
) {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(name + " must be a positive integer");
  }
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: options.idleTimeoutMs ?? 300_000,
    ...(options.statementTimeoutMs
      ? { statement_timeout: options.statementTimeoutMs }
      : {}),
  });
  return new PrismaClient({ adapter });
}

// Each service process owns its own client and connection pool.
export const db = createDb();
