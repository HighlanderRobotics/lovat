import "dotenv/config";

function requireVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required. Copy .env.example to .env in apps/support and set it there. ` +
        `Support reads .env from its own directory, so packages/db/.env is not used.`,
    );
  }

  return value;
}

function readPort(): number {
  const port = Number(process.env.PORT ?? 3000);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `PORT must be a positive integer, received ${JSON.stringify(process.env.PORT)}`,
    );
  }

  return port;
}

export const config = {
  port: readPort(),
  databaseUrl: requireVariable("DATABASE_URL"),
  lovatSigningKey: requireVariable("LOVAT_SIGNING_KEY"),
};
