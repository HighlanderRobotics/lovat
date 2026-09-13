# @lovat/db

Canonical Prisma 7.10.0 package for Lovat's PostgreSQL database. The server consumes it now; the separate support backend can use the same package later. Support models and application wiring are outside this change.

## Ownership and compatibility

This package owns the schema, the existing migration history, generated Prisma types/enums, and client construction. Database changes require review alongside all affected consumers. Keep schema changes backward compatible while services deploy independently. Preserve tenant and source-team authorization in each service; a shared database does not supply authorization.

Node.js 22.20.0 and TypeScript 5.9.3 are used to build ESM JavaScript and declarations. Prisma, its runtime, and the PostgreSQL adapter are pinned together. No root workspace is required: keep each app's package manager and lockfile and depend on `file:../../packages/db`. Do not import generated files directly or use this package in browser/mobile bundles.

## Install and use

From this directory:

```bash
npm ci
npm run build
```

Run `npm run build` after standalone installation to generate and compile the client; it needs no database credentials or database access. The package deliberately has no install hook: npm may execute local dependency hooks before their tools are installed. Server `npm ci` explicitly installs this package from its own lockfile and then builds it; server builds also rebuild it. Other consumers must arrange the same package install/build before compilation; do not run multiple installs against this directory concurrently.

```ts
import { db, UserRole } from "@lovat/db";

const user = await db.user.findUnique({ where: { id: userId } });
```

Set `DATABASE_URL` before importing the runtime. `dotenv/config` reads `.env` from the running application's working directory; the package never reads another application's environment file. Each process owns one exported client and a pool of up to 10 connections, with a 5-second connection/acquisition timeout and 5-minute idle timeout. Budget connections across replicas. Prisma 6 URL parameters such as `connection_limit` and `pool_timeout` do not configure the `pg` pool; adjust the adapter configuration if required. TLS verification is not disabled; configure trusted certificates for your deployment.

`createDb(url)` is available for explicitly managed clients; disconnect those when finished. Long-running services should reuse `db`, not create a client per request. Seeds remain server-owned: run `npm run db:seed` from `apps/server` explicitly.

## Schema commands

Run these from `packages/db`, with `DATABASE_URL` exported or a local `.env` here. For the server's development environment, set `DOTENV_CONFIG_PATH=../../apps/server/.env` explicitly.

```bash
npm run db:validate
npm run db:status
npm run db:migrate -- --name descriptive_change
npm run build
```

Prisma 7 keeps the database URL in `prisma.config.ts` and requires explicit client generation after schema changes. Migration files were moved unchanged from `apps/server/prisma/migrations`; no new migration is needed for extracting the package or upgrading the client.

## Deployment prerequisite: reconcile migration history

The checked-in history does **not** reproduce the current schema. For example, the alignment migration removes `Event.points`, but the current model requires it, and the initial migration contains previous-season enums. The previous Railway configuration used `db push`, so production's recorded migration state cannot be inferred from Git.

This branch removes the automatic `db push` predeploy command and does not automatically apply the old migrations. Before enabling migration-based deployment:

1. Inspect `prisma migrate status` and schema drift against a verified staging database or sanitized clone. Establish what migrations production has actually recorded.
2. Review a baseline/reconciliation plan for that state. Do not replay or mark migrations applied blindly, and do not reset an existing database.
3. Validate the plan on staging, including retained data and server behavior.
4. Configure exactly one release job to run `npm --prefix packages/db run db:deploy` from the repository root with the intended database URL. Support and server replicas must not each run migrations.

Railway must use repository root `/` and `Dockerfile.server` so both directories are available. The image installs both lockfiles, generates Prisma during the build, and starts from `/app/apps/server` using `dist/src/server.js`. Keep the Prisma CLI installed in the migration job. `railway.json` supplies the existing private database URL at runtime. Set the Railway service’s Root Directory to `/` in the dashboard as well; `railway.json` cannot expand a build context already restricted to `/apps/server`. Clear inherited build commands and the old `db push` pre-deploy command. These settings have been applied to the PR #16 server preview; production settings and databases remain unchanged. After changing the root directory, use a fresh source build if a redeploy retains the old snapshot.

## Integration checks

Use only a disposable local database named `lovat_test`:

```bash
export DATABASE_URL=postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test
npm run db:validate
npx --no-install prisma db push
LOVAT_DB_TEST=1 npm run test:integration
```

CI provisions PostgreSQL 16 and uses `db push` only for this empty disposable database because of the pre-existing migration gap. Tests exercise actual writes, nested relations, generated enums, JSON defaults and updates, Prisma error identity, transaction rollback, and parameterized SQL. They do not certify production migration readiness. Server build, compilation checks, and lint remain separate required checks.
