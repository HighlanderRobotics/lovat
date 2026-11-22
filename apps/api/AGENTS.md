# Replacement API

- This is the independent replacement for apps/server. Never import legacy handlers across application boundaries.
- Consume public schemas from @lovat/api and database models from @lovat/db.
- Run bun run build, bun test ./test/*.test.mjs, bun run lint, bun run format:check, and bun run inventory:check. Use Bun 1.4.4 and Hono; preserve the app Bun lockfile.
- Keep analysis data access behind the scoped repository; preserve training, reliability, source-team, tournament, and season restrictions.
- Treat v3 metric semantics as versioned. Add fixtures and document intentional differences from legacy outputs.
