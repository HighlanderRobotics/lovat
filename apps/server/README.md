# Lovat Server

The Server is Lovat's Express and Prisma backend for authentication, report storage, event-data imports, caching, and analysis.

Return to the [monorepo README](../../README.md).

## Prerequisites

- Node.js 22.20.0
- PostgreSQL
- Redis

## Setup

The automated local setup installs the pinned dependencies, starts isolated
PostgreSQL and Redis services, creates `.env` when needed, and applies the
committed Prisma migrations:

```bash
nvm use
npm run local:setup
npm run local:dev
```

Stop the local services without deleting their data with `npm run local:stop`.
The managed services use ports `55432` and `56379`, keeping them separate from
default PostgreSQL and Redis installations. Their data and logs are retained
under the ignored `.local/server` directory between runs.

The local scripts always connect to these development-only services, even if
`.env` contains a different database URL. Add optional
external-integration credentials to `.env` after it is created.

For a manual setup instead:

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
npm test
npm run lint
```

`npm test` currently verifies TypeScript compilation rather than behavioral coverage.

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
