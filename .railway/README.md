# Railway infrastructure

`railway.ts` owns build and deployment settings for `api`, `worker`, `dashboard`,
`website`, and `learn`. Install the isolated tooling with `npm --prefix .railway ci`
and check it with `npm --prefix .railway run typecheck` and
`npm --prefix .railway test`. Use Node 22.20.0 and Railway CLI 5.62.1 or newer.

The `lovat-apps` named partial owns only these application services. Databases,
volumes, buckets, and domains remain managed outside this repository. Existing
variable names are listed with `preserve()`; their values remain on Railway.
GitHub sources and root directories are declared explicitly because omission
would disconnect sources or delete variables during adoption. This prevents an app configuration apply from deleting omitted
infrastructure. Any other IaC authoring file targeting the same environment must
also use a named partial. Do not rename the partial after adoption without
transferring ownership with `railway config partials`.

CLI 5.62.1 includes the environment-context fix from railwayapp/cli#1139.
Older releases can pass an empty context and silently omit staging limits; the
authoring file now refuses to render without an environment name.

## One-time cutover

The TypeScript file is evaluated by the CLI; Railway does not read it during image
deployment. Do not put its path in the dashboard's legacy **Config File** field.

1. Authenticate with `railway login`, then `railway link` to the intended Lovat
   project and a disposable preview environment. Verify the project/environment
   and actual service names, especially `api` (the directory is `apps/server`).
   Never link this file to an unrelated project.
2. Verify the declared source connections and roots: `/` for api, worker, website;
   `/apps/dashboard` for dashboard; `/apps/learn` for learn. For a PR environment, set
   `RAILWAY_CONFIG_BRANCH` to its existing GitHub branch for every plan/apply.
   Production uses `main`; staging retains `offseason/mock-game-charged-up`.
   Compare variable names with `env` in the file and add `preserve()` entries for
   any newly configured variables before applying. Never include secret values. Preserve Dashboard's existing release workflow when deciding source/deploy policy.
3. Confirm the preview has isolated Postgres/Redis and sandbox integration keys.
   Deploy API migrations before the worker starts; API remains the migration owner.
4. Clear the old **Config File** paths on all five services. The old app-local
   `railway.json` files are removed by this PR. Preserve the last applied settings
   until the new configuration is applied; coordinate this step before deploying
   the merged sources. Do not run `config migrate --apply` over this authored file.
5. From the repository root, run `railway config plan` (for previews, prefix it
   with `RAILWAY_CONFIG_BRANCH=<existing-preview-branch>`). Review every change:
   existing services should be adopted, never duplicated under different names.
   Expect the existing build/deploy settings plus `.railway` watch paths. Reject
   any service, variable, domain, or storage removals. If unrelated changes are
   already staged in the environment, preserve that patch: do not use the shared
   accept/deploy action. Review the IaC plan separately and verify the pre-existing
   patch is unchanged afterward. Inspect ownership
   with `railway config partials list` if the environment already has IaC owners.
6. Run `railway config apply` after reviewing the plan, using the same
   `RAILWAY_CONFIG_BRANCH` for previews. Deploy the preview images,
   verify API `/live` and `/ready`, Worker `/health`, and web `/healthz`, and check the worker logs for a
   successful current-year tournament import. The server no longer imports the
   tournament catalog; a healthy worker with `TBA_KEY` is required.
7. Repeat the link, config-path clearing, plan, apply, and health checks in the
   intended production environment after preview validation.

## Subsequent changes

Run local checks, link the intended environment, run `railway config plan`, review,
then `railway config apply` before deploying application images. Merely merging
this file does not apply infrastructure. The CI workflow validates TypeScript and
renders production/staging graphs without credentials; it does not apply changes.

Platform-default values are omitted from the authoring graph to avoid perpetual
no-op drift: sleeping is disabled, restart policy is `ON_FAILURE`, and the default
retry count is 10. The explicit per-region replica maps retain one western replica.
Non-production API builds retain inert inherited Nixpacks metadata; Dockerfile
remains the active builder.

API retains the private database migration/start command and staging's 2 CPU /
2 GiB limit. Worker retains its single western replica, disabled sleeping, and
60-second drain window. Historical tournament imports are explicit worker jobs:
`bun run enqueue tournaments 2025` or `bun run backfill 1992 2025`.

See [Railway's IaC migration guide](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code).

## API readiness adoption (LVT-339)

The API proposal now uses `/ready` and a 15-second drain window. Deploy the
Server version containing `/ready` before applying that setting. Plan against
the actual production/preview environment and preserve unrelated staged changes.
The Server exits after at most ten seconds of draining/cleanup and runs Node
directly so SIGTERM reaches the application. See the
[health and rollback procedure](../apps/server/docs/health-and-shutdown.md).
When rolling back to an older image without `/ready`, restore the saved `/status`
healthcheck setting before deploying it. The current live API settings still use `/status`; readiness adoption and
rollback testing remain to be completed against the new image.
