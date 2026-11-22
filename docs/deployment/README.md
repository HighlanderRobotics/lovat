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
