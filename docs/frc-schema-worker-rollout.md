# Competition schema and import worker rollout

The schema/worker PR is the prerequisite for the public website PR (#82). Merge
this infrastructure first. The website PR includes public competition queries,
scouting aggregates, and presentation; none of those routes are required to run
the importer.

## Before merging

1. Check the schema/worker PR's Server, Worker, database integration, Docker,
   CodeQL, and Monorepo CI results.
2. Back up the production database and verify its migration history. This PR adds
   five forward migrations after `0_baseline`. A populated database must already
   have a verified baseline recorded; do not apply the baseline SQL to existing
   tables or use `db push` to bypass migration history.
3. Rehearse migration deployment on a production-schema/data clone. Compare
   scouting report/action counts and keys before and after, run migration status,
   and check schema drift. Disposable fixture tests and a sanitized PR database
   do not replace this production rehearsal.
4. Configure the production worker as an empty service before the API rollout:
   repository root `/`, config `/apps/worker/railway.json`, Dockerfile
   `apps/worker/Dockerfile`, one replica, sleeping disabled, no cron. Set
   `DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}`, `TBA_KEY=${{api.TBA_KEY}}`,
   and `WORKER_CONCURRENCY=2`. Verify names and references in production. Do not
   connect its source/start it until migrations finish.

## Deploy in order

1. Merge the schema/worker PR and deploy the API. Its existing start command runs
   `npm --prefix ../../packages/db run db:deploy` against `DATABASE_PRIVATE_URL`
   before starting. Confirm the production service uses repository-root builds
   and `/apps/server/railway.json`, and has no inherited `db push` command. Use a
   single migration owner; avoid simultaneous migration runners.
2. Confirm all five migrations are applied and `/status` is healthy. Existing
   reports and participant keys are retained; missing parent teams receive a
   number-only placeholder.
3. Connect the worker to `main`, build, and verify `/health`. The worker deliberately
   does not run migrations. Check imports succeed and claimed jobs complete;
   participant changes affecting scouted slots must fail for reconciliation.
4. Smoke-test Dashboard's match refresh. The API now queues imports and returns
   stored data immediately, so the worker must be running for refreshed matches
   to appear. This asynchronous behavior is the main operational change.
5. Optionally queue historical imports with `bun run backfill 1992 2025` from a
   worker image using the verified production connection. Current-season imports
   start automatically; do not copy sanitized preview accounts into production.
6. Retarget #82 to `main` after this prerequisite is merged, then review/deploy
   website and public API changes separately. If the first PR is squash-merged,
   update #82's ancestry so the infrastructure does not reappear in its diff.

## Recovery and preview data

If the worker fails, stop it and resolve the job's error; queue rows, validators,
and leases persist in PostgreSQL. Do not reverse migrations that have received
new data. The old API importer must not run concurrently with the worker.

Railway PR environments are ephemeral and may be deleted when a PR closes.
Duplicating environment configuration does not guarantee a copy of its volume
contents. Keep a verified database snapshot outside the environment, retain #82
while testing the website, and verify any restored preview before relying on it.
The original September backup and the current PR database must remain untouched.
