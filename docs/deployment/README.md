# Deployment and previews

[Developer docs](../README.md) · [Testing and CI](../testing/README.md)

| Service | Release path | Details |
| --- | --- | --- |
| API | Railway, built from repository root | [Server deployment](../../apps/server/README.md#database-and-deployment) and [database migrations](../../packages/db/README.md) |
| Worker | Railway, built from repository root | [Worker setup](../../apps/worker/README.md) and [batch rollout](../worker-batch-rollout.md) |
| Dashboard web | Release-managed; see the hosting switch and rollback instructions | [Dashboard release workflow](../../.github/workflows/dashboard-deploy.yml) and [web hosting](../railway-web-hosting.md) |
| Website and Learn | Railway web service configuration; see cutover and rollback instructions | [Railway web hosting](../railway-web-hosting.md) |
| Collection | Expo Application Services (EAS) | [Collection guide](../../apps/collection/README.md) |
| Dashboard Android | GitHub Actions release artifact | [Dashboard release workflow](../../.github/workflows/dashboard-deploy.yml) |

For Railway service roots and the plan/apply process, use [Railway configuration as code](../../.railway/README.md) and the [deployment graph](../../.railway/railway.ts). These document the configured deployment paths; consult the provider and release workflow for live state rather than assuming a public domain has cut over.

## Before promoting a change

1. Verify the target project, environment, and source revision. Test in an isolated PR environment first.
2. Use preview-only database and Redis instances, plus sandbox credentials for outbound integrations. Never copy production connection strings or signing keys into a preview.
3. Review the configuration diff before applying and follow the service-specific migration and health checks.
4. Record the tested revision and verify a rollback path before promoting to production.

[Test report hosting](../test-report-hosting.md) covers the separate GitHub Pages test site.

## Public production smoke checks

After a production deployment, run **Public deployment smoke** from the repository's
Actions tab on `main`, or run `node scripts/deployment-smoke.mjs` with Node 22.20.0.
It checks the deployed Website home, Learn root redirect and Welcome guide,
Dashboard shell and JavaScript entry point, and the public API `/status` and
`/version` contracts. The target domains and paths are fixed in the script.
It sends only bounded, anonymous GET requests, never follows redirects, and
retries timeouts, network errors, 429s and 5xx responses once for cold starts.
This is a manual check, not a periodic probe that could wake a sleeping service.

Record the deployment SHA/ID separately from the smoke runner commit, and link
the Actions run to the release notes or incident. The run publishes a short log
as a 14-day artifact on success or probe failure. It logs the fixed endpoint,
status, elapsed time, retry count and failure category, not response contents or
arbitrary response headers. An overall failure is evidence to investigate,
not an automatic rollback: verify the deployed revision, check the provider and
service logs, and decide whether to repair or restore the last healthy release.

`/status` is the current public **process** status, not dependency readiness.
This check does not establish PostgreSQL/Redis health, verify a deployed SHA,
exercise authenticated reads or submissions, or monitor production continuously.
Dependency readiness and shutdown remain in [LVT-339](https://linear.app/highlander-robotics/issue/LVT-339).
An authorized synthetic read, isolated test report, alerts, service metrics and
rollback rehearsal remain in [LVT-347](https://linear.app/highlander-robotics/issue/LVT-347).
