# Server test report hosting

The combined server coverage run produces a static Vitest overview with unit
and integration results, timings, source views, and coverage. GitHub Pages hosts
the generated files; no Node.js server, production database, or live Vitest
process is needed to view them.

## Enable publishing

1. In the repository's **Settings → Pages**, select **GitHub Actions** as the
   build and deployment source.
2. Ensure the `github-pages` environment permits deployments from `main`.
3. In **Settings → Secrets and variables → Actions → Variables**, create the
   repository variable `TEST_REPORT_PAGES_ENABLED` with the value `true`.
4. Merge this change, or rerun all jobs of the latest main CI run that includes
   server changes after enabling these settings.

The default report URL is <https://highlanderrobotics.github.io/lovat/>. For
`tests.lovat.app`, configure that custom domain in Pages and add a DNS CNAME for
`tests` pointing to `highlanderrobotics.github.io`. Enable HTTPS once GitHub has
verified the domain. The custom domain is optional.

## Updates and failures

CI generates the report while running tests against disposable PostgreSQL and
Redis. It uploads `server-test-report` for PR and main runs, even after test
failures when report files are available. The separate `server-coverage`
artifact continues to contain coverage files.

Only successful main push runs with server changes package a Pages artifact.
Publishing waits for both the server job and the Monorepo CI gate to pass.
PRs never publish, and failures leave the last successful public report intact.
Merges that do not run server tests leave that report unchanged. Use the CI run
history to identify which commit produced the latest successful deployment.

Publishing is disabled until `TEST_REPORT_PAGES_ENABLED=true`; test generation
and downloadable artifacts still work. Setting the variable to `false` stops
future deployments without deleting the last published site.

## Local preview

From `apps/server`, run `npm run test:coverage` using the disposable service
configuration documented in the server README, then `npm run test:report:preview`.
The generated site lives in `apps/server/test-report/` and is ignored by Git and
excluded from the API Docker build context.

The public site includes test source code, test names, and synthetic fixture
output from this public repository. Keep real credentials and scouting data out
of test fixtures and logs.
