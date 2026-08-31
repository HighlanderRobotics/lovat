# Server agent instructions

- Use Node.js 22.20.0 from `.nvmrc` and install with `npm ci`.
- Run `npm run build`, `npm test`, and `npm run lint` for code changes.
- `npm test` compiles TypeScript and runs the server's behavioral tests; describe coverage only for the behaviors those tests exercise.
- Prisma schema and migrations live under `prisma/`. Use reviewed migrations for schema changes and verify database URLs before destructive commands.
- PostgreSQL and Redis are required for normal local startup. Do not weaken authentication or source-team visibility to simplify testing.
- Treat report events, authentication headers, deep links, and analysis responses as cross-app contracts.
- Keep secrets in `.env` or provider configuration. Never commit database dumps.
