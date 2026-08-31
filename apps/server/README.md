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

Fill the local `.env` without committing it. PostgreSQL and Redis are required to start the service; external integrations are optional only when the exercised code path permits.

The example configuration uses Redis logical database 1 and prefixes every key with `lovat:local:`. Keep both settings isolated from other applications. To remove only Lovat-owned cache entries, run:

```bash
npm run cache:reset
```

## Checks

```bash
npm run build
npm test
npm run lint
```

`npm test` compiles the server and runs its behavioral tests.

## Optional database restore

For realistic local testing, an authorized maintainer may provide a sanitized PostgreSQL dump. Verify the destination connection before running a destructive restore.

```bash
pg_restore -d "postgresql://YOUR_LOCAL_CONNECTION" /path/to/backup.dump \
  --clean --if-exists --no-owner
```

Never restore a dump into an unverified database or commit a dump to this repository.
