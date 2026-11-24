# Railway release migration rehearsal

[LVT-338](https://linear.app/highlander-robotics/issue/LVT-338) ·
[Deployment overview](README.md) ·
[Existing Prisma migration procedures](../../packages/db/README.md#migration-history-and-deployment)

This is a preview rehearsal, not a production change. The [current API
start command](../../.railway/railway.ts) assigns its private PostgreSQL URL to
`DATABASE_URL`, runs `db:deploy`, then starts the API. The Worker does not run
migrations. Leave both live settings as they are until the rehearsal succeeds
and the release owner approves a separate production rollout.

## Proposed release order

1. Use one API pre-deploy command from the candidate API image to own schema
   migrations. The image already contains the Prisma CLI, configuration,
   and migration files. Railway runs the command in a separate container
   with private network and environment access, but without mounted volumes.
   A nonzero exit prevents promotion; Railway does not automatically retry
   the command. Set a timeout based on measured rehearsal time. Keep
   `DATABASE_URL` mapped to the API's private database URL at runtime even
   after removing `db:deploy` from the start command.
   From the current API image's working directory, the pre-deploy command is
   `sh -c 'export DATABASE_URL="$DATABASE_PRIVATE_URL"; exec npm --prefix ../../packages/db run db:deploy'`.
   The candidate start command keeps the same export and ends with `exec npm start`.
   [Railway pre-deploy semantics](https://docs.railway.com/deployments/pre-deploy-command)
2. For a release that changes the shared schema, promote the exact reviewed API
   SHA first. Verify migration status, `GET /ready` and a database-backed read of synthetic
   data. Only then promote the Worker at that same SHA and verify it can drain
   an isolated batch, or reconcile and pass `/health` if in continuous mode.
   API and Worker watch the shared database package, so a push can trigger both.
   Railway does not order independent GitHub autodeploys even when services
   reference each other. Use an explicitly ordered promotion for schema releases
   rather than relying on reference variables or **Wait for CI** for this.
   [Railway deployment ordering](https://docs.railway.com/deployments/deployment-actions#deployment-dependencies-startup-ordering)
3. Use expand/contract across releases. Apply only additive, compatible changes
   while an older API or Worker can still be running or needed for rollback.
   Where a backfill or transition needs both representations, verify old
   writes and new writes remain readable, and validate the backfill. Remove
   legacy fields in a later release after the old versions and their rollback
   window are retired. Do not count Prisma's advisory lock as a release gate.
   [Prisma v7 production migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)

## Rehearse in an isolated preview

Before starting, verify the preview project, environment, service IDs, database
and Redis references, and sandbox-only integration credentials. Use disposable
storage and synthetic fixtures only. Keep automatic API/Worker promotion out
of the test. Capture the baseline service deployment IDs, SHAs, readiness,
expected sample rows, and migration status. Choose an exact candidate SHA with
a backwards-compatible migration not present in the baseline; a migration
no-op can test the gate but does not prove a schema change. An approved
operator can select a commit using the [Railway exact-SHA deployment API](https://docs.railway.com/integrations/api/manage-services).

| Step | Evidence required |
| --- | --- |
| **Reject** | In preview only, configure the candidate pre-deploy step to print a fixed marker and exit nonzero **before** it invokes Prisma. Deploy the recorded candidate SHA. Record the failed pre-deploy attempt. Verify the old API deployment and its `/version` SHA remain active, an existing sample read still works, the Worker was not promoted, and the migration history is unchanged. |
| **Promote** | Replace the test failure with the migration command and retry the **same candidate SHA**. Capture its deployment ID and the single successful pre-deploy execution. Verify no pending or failed migrations for that revision and validate its synthetic rows. Verify API `/version` and readiness, then promote Worker at that SHA and verify its operation. |
| **Repeat** | A second run of the same release migration must apply nothing. Restart or cold-start the API container and verify startup logs do not show a migration runner. Record which migration ran and how long it took. |
| **Roll back the app** | With the additive schema retained, restore the recorded baseline API and Worker releases. Verify live service SHAs, health and a read plus write of synthetic data on the expanded schema. Check the restored start command and variables: Railway rollback can restore older settings as well as the image. Reconfirm single migration ownership before another release. |

Railway's rollback does **not** undo PostgreSQL schema or data changes. If a real
migration fails (rather than the injected test), stop promotion and inspect
both the recorded failed migration and the actual schema; never blindly
re-run or mark it resolved. Use the existing
[failed migration procedure](../../packages/db/README.md#migration-history-and-deployment)
and the separately tracked [backup and restore drill](https://linear.app/highlander-robotics/issue/LVT-346)
where appropriate.

## Evidence boundary

The existing Server image smoke job runs Prisma then boots the same image
against disposable PostgreSQL and Redis. It does not test Railway's pre-deploy
failure behavior or coordinated Worker promotion. Record preview pass/fail/rollback
outcomes, migration status, service deployment IDs, and sanitized logs on
LVT-338. Do not include connection strings or credentials. Keep the issue open
until the preview evidence exists and the production cutover is approved and verified.
