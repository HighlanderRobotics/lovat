# Replacement API

- This is the independent replacement for apps/server. Never import legacy handlers across application boundaries.
- Consume public schemas from @lovat/api and database models from @lovat/db.
- Run npm run build, npm test, npm run lint, npm run format:check, and npm run inventory:check.
- Keep analysis data access behind the scoped repository; preserve training, reliability, source-team, tournament, and season restrictions.
- Treat v3 metric semantics as versioned. Add fixtures and document intentional differences from legacy outputs.
