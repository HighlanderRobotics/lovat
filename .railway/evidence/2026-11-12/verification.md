# Lovat Railway cutover verification — November 12, 2026

Read-only inspection used Railway MCP plus Railway CLI **5.62.1**. The project is
`lovat` (`c210dce8-37af-4bf0-b1e0-7e28b30597c6`) in **8033 Admin's Projects**.
The connector's list-projects response omitted this project; direct lookup by
the project ID from GitHub's deployment status links and CLI linking succeeded.
No infrastructure apply, deployment, variable update, resource deletion or DNS
change was performed. Opening the associated application PRs automatically
created Railway preview builds through the existing GitHub integration.

## Verified state

| Environment  | ID                                     | App source branch                                         | Named partial               | Aligned plan |
| ------------ | -------------------------------------- | --------------------------------------------------------- | --------------------------- | ------------ |
| production   | `9f0088a8-9fe7-4afa-b634-cd1db046f045` | `main`                                                    | `lovat-apps`, all five apps | No changes   |
| staging      | `1902828c-65ae-455c-90c8-5a370b7cedab` | `main`                                                    | `lovat-apps`, all five apps | No changes   |
| lovat-pr-128 | `d42d9835-c01a-48c4-bcd2-424fa61e93c3` | `jackshim415/lvt-334-server-redact-request-analytics-and` | `lovat-apps`, all five apps | No changes   |

All environments had no pending staged patch at inspection. Ownership maps
contain exactly `service.api`, `service.worker`, `service.dashboard`,
`service.website` and `service.learn`; databases and storage are outside this
partial. Legacy Config File is blank on API; the other four apps have no legacy
file configured. All five use Dockerfile builds and include `/.railway/**` in
their watch patterns. API and Worker additionally watch `/packages/db/**`.

| App       | Source root       | Dockerfile                | Current healthcheck     |
| --------- | ----------------- | ------------------------- | ----------------------- |
| api       | `/`               | `apps/server/Dockerfile`  | `/status`, 1200 seconds |
| worker    | `/`               | `apps/worker/Dockerfile`  | `/health`, 120 seconds  |
| dashboard | `/apps/dashboard` | `Dockerfile`              | `/healthz`, 120 seconds |
| website   | `/`               | `apps/website/Dockerfile` | `/healthz`, 120 seconds |
| learn     | `/apps/learn`     | `Dockerfile`              | `/healthz`, 120 seconds |

All apps use one replica in `us-west2`. Dashboard, Website and Learn sleep in all
three environments; API sleeps in staging/previews and stays awake in production.
Staging and preview API have two CPUs/2 GiB container limits. Worker drains for
60 seconds. Current API start runs Prisma deploy before npm start; Worker does
not run migrations. This verifies the declared migration owner, not safe
coordination across concurrent API releases (LVT-338).

## Drift fixed in the authoring file

The baseline plans would have removed web sleeping in production; changed all
five staging sources back to `offseason/mock-game-charged-up`; removed staging
and preview sleeping; and removed the inherited preview API limits. The
accompanying IaC change preserves the observed source/sleeping/limit settings.
Replanned production, staging and PR #128 all return **zero changes and zero
diagnostics**, with no apply requested. See the individual plan summaries for
before/after differences and live config ETags.

Deployment gates remain disabled in source config (LVT-337). API readiness and
termination are proposed in LVT-339; applying those settings requires deploying
the new image first. This audit intentionally leaves those live settings as
observed. No source root, watch path, variable set or resource identity changed.

## Storage, credentials and remaining verification

Production and staging each show Postgres and Redis volumes at 5 GB; PR #128
shows its environment-provisioned volumes at 50 GB. Railway resource IDs are
project-scoped logical identities reused across environments, so matching IDs
alone do **not** establish shared data or isolation. Production additionally has
the `Postgres-PITR` bucket in `sjc`; its presence alone does not establish backup
coverage, retention or successful recovery. LVT-346 owns restore evidence.

The OAuth connector exposes variable names only, with `valuesRedacted: true`.
No secret values were fetched or committed. The required variable names are
preserved in the partial, but PostgreSQL/Redis connection targets, credentials
and sandbox integration isolation remain **unverified**. An administrator must
verify their references/targets and sandbox credentials before running writes,
provider integrations, database copies or dependency fault injection in preview.

PR #128's API, Website, Dashboard and Learn deployment checks passed during this
inspection. Its Worker had no preview deployment at the snapshot point. A
passing deployment or static health endpoint does not prove dependency health,
import freshness or isolation. No manual production traffic, fault injection,
restore or rollback exercise was performed. Keep LVT-336 open until the remaining
isolation and rollback evidence is recorded; named-partial adoption itself is
confirmed for the inspected environments.

## Reproduce without applying changes

From the repository root, with Node 22.20.0 and the pinned `.railway` tooling:

```sh
railway link --project c210dce8-37af-4bf0-b1e0-7e28b30597c6 --environment production --service api
railway config partials list --json
railway config plan --json
# Repeat linking/planning for staging.
railway link --project c210dce8-37af-4bf0-b1e0-7e28b30597c6 --environment lovat-pr-128 --service api
railway config partials list --json
RAILWAY_CONFIG_BRANCH=jackshim415/lvt-334-server-redact-request-analytics-and railway config plan --json
```

Run CLI commands directly from the shell. The SDK's native-evaluation version
guard uses environment variable `_` to find the executable; a Python subprocess
wrapper left it pointing at Python and incorrectly reported an old Railway CLI.
Direct commands succeeded. Do not bypass the version requirement or upgrade the
pinned tooling to compensate for that wrapper behavior.

The [live inventory](live-inventory.json) includes config, deployment IDs,
networking and variable **names** for rollback/reference. The plan summaries
exclude graph variable values. Before using a snapshot for recovery, recheck the
current project/environment, ETag, active deployment and staged changes. Use the
normal reviewed IaC procedure and preserve resources outside this partial.
