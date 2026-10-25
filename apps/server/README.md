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
npm run test:coverage:unit
npm run lint
```

`npm test` runs non-watch Vitest behavior tests. `npm run typecheck` checks
application types, and `npm run typecheck:test` also checks test and Vitest
configuration types. `npx vitest --coverage` (watch mode) and
`npm run test:coverage:unit` (one run) measure the fast suite and require 100%
coverage for every source file. The fast HTTP suite uses Supertest with a
synthetic signing key and mocked database lookups, so it does not need
PostgreSQL, Redis, or external accounts.

The integration suites cover report uploads, API key and picklist lifecycles,
team isolation, all numeric and categorical analysis metrics, and caching with
real disposable PostgreSQL and Redis. After
deploying the checked-in migrations to a database named `lovat_test`, run:

```bash
LOVAT_DB_TEST=1 \
  DATABASE_URL=postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test \
  REDIS_URL=redis://127.0.0.1:6379/15 \
  npm run test:integration

# Measure both suites together using the same disposable services:
LOVAT_DB_TEST=1 \
  DATABASE_URL=postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test \
  REDIS_URL=redis://127.0.0.1:6379/15 \
  npm run test:coverage
```

The suite refuses non-loopback hosts, a database with another name, or a Redis
database other than 15. The existing shared database integration tests run
separately from `packages/db`.

`test:coverage` runs both Vitest projects and includes every `src/**/*.ts` file
in the denominator, including the process entrypoint and seed script. It writes a
Vitest test overview at `test-report/index.html`, an HTML coverage report at
`test-report/coverage/index.html`, an LCOV report, and JSON summaries. CI runs
this combined command after deploying the disposable database and uploads the
`server-coverage` artifact even when a test or coverage gate fails.

`vitest.config.ts` and `vitest.coverage.config.ts` require 100% lines, statements,
functions, and branches for every source file. The combined suite includes behavioral tests for
schedules, imports, onboarding, Slack, CSV exports, permissions, source visibility,
and analysis, plus database and cache integration tests. Coverage measures which
code executes; the assertions verify the expected responses, calculations, and
side effects.

When another coverage watcher is running locally, keep reports separate with
`npm run test:coverage -- --coverage.reportsDirectory=/private/tmp/lovat-coverage`.
CI checks unit-only coverage independently before the combined run and uses
the default `coverage/` directory for unit-only runs and `test-report/coverage/`
for combined runs.

### Static test overview

After `npm run test:coverage` completes with disposable services, run
`npm run test:report:preview` and open the printed local URL. The static Vitest
UI lists the unit and integration tests, their results and timings, and coverage.
It works without a running test process once generated.

When `--coverage.reportsDirectory` overrides the coverage output location,
report preparation copies the current run's coverage into the static site.
The custom directory is preserved and stale files in the site's coverage folder
are replaced. `npm run test:report:prepare` checks this behavior.

CI uploads the full `server-test-report` artifact, including failed test runs
when a report is available. Download and extract the artifact, then serve its
directory with a static HTTP server; opening `index.html` directly from disk
cannot load the compressed test data reliably.

Successful server CI runs on main can publish the report to GitHub Pages.
See [test report hosting](../../docs/test-report-hosting.md) for the one-time
Pages settings, public URL, and optional `tests.lovat.app` custom domain.

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
