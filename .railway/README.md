# Railway infrastructure

`railway.ts` owns build and deployment settings for `api`, `worker`, `dashboard`,
`website`, and `learn`. Install the isolated tooling with `npm --prefix .railway ci`
and check it with `npm --prefix .railway run typecheck` and
`npm --prefix .railway test`. Use Node 22.20.0 and Railway CLI 5.42.1 or newer.

The `lovat-apps` named partial owns only these application services. Databases,
volumes, buckets, secrets, domains, and source connections remain managed outside
this repository. This prevents an app configuration apply from deleting omitted
infrastructure. Any other IaC authoring file targeting the same environment must
also use a named partial. Do not rename the partial after adoption without
transferring ownership with `railway config partials`.

## One-time cutover

The TypeScript file is evaluated by the CLI; Railway does not read it during image
deployment. Do not put its path in the dashboard's legacy **Config File** field.

1. Authenticate with `railway login`, then `railway link` to the intended Lovat
   project and a disposable preview environment. Verify the project/environment
   and actual service names, especially `api` (the directory is `apps/server`).
   Never link this file to an unrelated project.
2. Keep the existing source connections and roots: `/` for api, worker, website;
   `/apps/dashboard` for dashboard; `/apps/learn` for learn. These settings remain
   provider-managed, as do domains and environment variables. Keep Dashboard's
   release workflow as its deploy authority; do not add GitHub autodeploys to it.
3. Confirm the preview has isolated Postgres/Redis and sandbox integration keys.
   Deploy API migrations before the worker starts; API remains the migration owner.
4. Clear the old **Config File** paths on all five services. The old app-local
   `railway.json` files are removed by this PR. Preserve the last applied settings
   until the new configuration is applied; coordinate this step before deploying
   the merged sources. Do not run `config migrate --apply` over this authored file.
5. From the repository root, run `railway config plan`. Review every change:
   existing services should be adopted, never duplicated under different names.
   Expect the existing build/deploy settings plus `.railway` watch paths. Reject
   unexpected service, variable, domain, or storage removals. Inspect ownership
   with `railway config partials list` if the environment already has IaC owners.
6. Run `railway config apply` after reviewing the plan. Deploy the preview images,
   verify `/status`, `/health`, and `/healthz`, and check the worker logs for a
   successful current-year tournament import. The server no longer imports the
   tournament catalog; a healthy worker with `TBA_KEY` is required.
7. Repeat the link, config-path clearing, plan, apply, and health checks in the
   intended production environment after preview validation.

## Subsequent changes

Run local checks, link the intended environment, run `railway config plan`, review,
then `railway config apply` before deploying application images. Merely merging
this file does not apply infrastructure. The CI workflow validates TypeScript and
renders production/staging graphs without credentials; it does not apply changes.

API retains the private database migration/start command and staging's 2 CPU /
2 GiB limit. Worker retains its single western replica, disabled sleeping, and
60-second drain window. Historical tournament imports are explicit worker jobs:
`bun run enqueue tournaments 2025` or `bun run backfill 1992 2025`.

See [Railway's IaC migration guide](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code).
