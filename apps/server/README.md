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

## Custom post-match questions

Apply the `20261024000000_custom_post_match` database migration before running this version. `RegisteredTeam.customPostMatch` stores up to three question strings. Questions must be unique, nonempty, and at most 300 characters; free-text answers may contain up to 2,000 characters and can be left blank.

- Collection: `GET /v1/manager/custom-post-match` authenticates with `X-Team-Code` and returns `{ teamNumber, customPostMatch: string[] }` for that team.
- Dashboard: `GET /v1/manager/settings/custom-post-match` reads the current team's questions. `PUT` accepts `{ customPostMatch: string[] }`; only signed-in scouting leads can update it, not API keys.
- Reports: optional `customPostMatch: { question: string, answer: string }[]` is accepted by the Collection and QR/Dashboard upload endpoints. Each report preserves its question wording; offline uploads are not compared against the team's latest settings. Older reports default to an empty list.

Individual report responses and Dashboard overviews include these answers. Report CSV exports append three question/answer column pairs, preserving the existing source-team filter. CSV quoting preserves punctuation and multiline answers.
