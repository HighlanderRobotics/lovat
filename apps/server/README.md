# Lovat Server

The Server is Lovat's Express and Prisma backend for authentication, report storage, event-data imports, caching, and analysis.

Return to the [monorepo README](../../README.md).

## Prerequisites

- Node.js 22.20.0
- PostgreSQL
- Redis

## Setup

```bash
nvm use
npm ci
cp .env.example .env
npm run dev
```

`npm ci` also installs and builds the local `@lovat/db` package from its own lockfile. Keep the full monorepo checkout available. `npm run build` regenerates its client before compiling the server.

Fill the local `.env` without committing it. PostgreSQL and Redis are required to start the service; external integrations are optional only when the exercised code path permits.

## Checks

```bash
npm run build
npm run typecheck
npm run typecheck:test
npm test
npm run test:coverage
npm run lint
```

`npm test` runs non-watch Vitest behavior tests. `npm run typecheck` checks
application types, and `npm run typecheck:test` also checks test and Vitest
configuration types. `npm run test:coverage` includes untested application
modules in the coverage report. The fast HTTP suite uses Supertest with a
synthetic signing key and mocked database lookups, so it does not need
PostgreSQL, Redis, or external accounts.

The report integration suite uses disposable local PostgreSQL and Redis. After
deploying the checked-in migrations to a database named `lovat_test`, run:

```bash
LOVAT_DB_TEST=1 \
  DATABASE_URL=postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test \
  REDIS_URL=redis://127.0.0.1:6379/15 \
  npm run test:integration
```

The suite refuses non-loopback hosts, a database with another name, or a Redis
database other than 15. The existing shared database integration tests run
separately from `packages/db`.

## Optional database restore

For realistic local testing, an authorized maintainer may provide a sanitized PostgreSQL dump. Verify the destination connection before running a destructive restore.

```bash
pg_restore -d "postgresql://YOUR_LOCAL_CONNECTION" /path/to/backup.dump \
  --clean --if-exists --no-owner
```

Never restore a dump into an unverified database or commit a dump to this repository.

## Database and deployment

The canonical schema and migrations are in [`packages/db`](../../packages/db). Prisma is pinned to 7.10.0. Run `npm run db:seed` explicitly from this app when needed; seeding is not automatic.

Railway must use the repository root and `apps/server/Dockerfile` so the shared package is included. See the [shared package deployment checklist](../../packages/db/README.md) before enabling migrations.

### Railway service configuration

Keep **Root Directory** set to `/` so Docker can copy `packages/db`. Set
**Config File** to `/apps/server/railway.json`; that file selects
`apps/server/Dockerfile`. Update this Railway setting before deploying the
relocation commit, since there is no longer a root `railway.json`.
Clear any old Dockerfile-path override pointing to `Dockerfile.server`.

The Dockerfile-specific `apps/server/Dockerfile.dockerignore` filters the
repository-root build context. Database migration, startup, environment
variables, and healthcheck behavior remain defined in the moved config.

Build locally from the repository root:

```sh
docker build -f apps/server/Dockerfile -t lovat-server .
```

### Development without a Blue Alliance key

In development, an empty `TBA_KEY` skips initial and scheduled Blue Alliance
imports so a fresh local database can start without an external API key.
PostgreSQL, Redis, and authentication remain enabled. Set `TBA_KEY` and restart
for real team, tournament, and match imports. Routes that call Blue Alliance
directly still require the key. Production keeps its existing import behavior.
