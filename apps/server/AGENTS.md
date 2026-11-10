# Server agent instructions

- Use Node.js 22.20.0 from `.nvmrc` and install with `npm ci`.
- Run `npm run build`, `npm test`, and `npm run lint` for code changes.
- `npm test` runs Vitest behavioral checks; run `npm run typecheck` and
  `npm run typecheck:test` separately because Vitest does not typecheck files.
- Prisma schema and migrations live under `../../packages/db/prisma/`; import database types and the client through `@lovat/db`. Use reviewed migrations for schema changes and verify database URLs before destructive commands.
- PostgreSQL and Redis are required for normal local startup. Do not weaken authentication or source-team visibility to simplify testing.
- Treat report events, authentication headers, deep links, and analysis responses as cross-app contracts.
- Keep secrets in `.env` or provider configuration. Never commit database dumps.

## Code formatting

- Give code breathing room: separate validation, database queries, guard clauses, state changes, and responses with blank lines.
- Use consistent two-space indentation and indent nested objects and callbacks clearly. Keep complex objects and calls on multiple lines.
- Use braces for every control-flow block, including single-statement guards; avoid compressed one-line conditions and statements.
- Group related fields together and separate distinct groups with blank lines when it improves readability. Avoid blank lines between every statement or field.
- Run Prettier from `apps/server` on edited files so formatting follows the Server's resolved configuration.
