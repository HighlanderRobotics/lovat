# Lovat developer docs

For instructions on using Lovat rather than developing it, start at [Lovat Learn](https://learn.lovat.app). The [monorepo README](../README.md) lists all applications.

## Build and change Lovat

| I want to… | Start here |
| --- | --- |
| Run an app locally or open a PR | [Local development and contributions](development/README.md) |
| Understand which service owns what | [Architecture and data flow](architecture.md) |
| Change the database schema | [Database package, migrations, and deployment](../packages/db/README.md) |
| Change how Collection drafts or uploads reports | [Collection reports in progress](collection-reports-in-progress.md) |
| Understand the 2026 training workflow | [Scouting training](training-2026.md) |
| Validate a change or find test results | [Testing and CI](testing/README.md) |

## Operate Lovat

- [Deployment and previews](deployment/README.md): hosting, release entry points, and safe preview checks.
- [Railway configuration as code](../.railway/README.md): plan and apply, service ownership, and cutover.
- [Railway web hosting](railway-web-hosting.md): Dashboard, Website, and Learn images, preview configuration, and rollback.
- [Worker batch rollout](worker-batch-rollout.md): scheduled imports, sleep verification, and rollout evidence.
- [Test report hosting](test-report-hosting.md): artifacts and the shared GitHub Pages site.

## History and migrations

- [Changelog](../CHANGELOG.md) and [retained commit archive](history/README.md).
- [Monorepo migration records](migration/README.md): original repositories, commit maps, baseline checks, and cutover evidence.
- [Competition schema and import worker rollout](frc-schema-worker-rollout.md): database compatibility and migration order.
