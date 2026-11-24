# Lovat test report hosting

GitHub Pages hosts static application test reports. No live
Vitest process, application server or database is needed to view the reports.

| Application | Test results                                                                             | Coverage                                                                 | Browser tests                                                             |
| ----------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Server      | [Vitest](https://highlanderrobotics.github.io/lovat/server/)                             | [Coverage](https://highlanderrobotics.github.io/lovat/server/coverage/)  | —                                                                         |
| Learn       | [Node tests and link-plugin coverage](https://highlanderrobotics.github.io/lovat/learn/) | Included in Node report                                                  | [Playwright](https://highlanderrobotics.github.io/lovat/learn/browser/)   |
| Website     | [Vitest](https://highlanderrobotics.github.io/lovat/website/)                            | [Coverage](https://highlanderrobotics.github.io/lovat/website/coverage/) | [Playwright](https://highlanderrobotics.github.io/lovat/website/browser/) |

The project root `/lovat/` is now a report directory. The Server report has moved
from `/lovat/` to `/lovat/server/`. All report links are relative, including the
Vitest coverage iframe, so nested project paths work without a custom domain.
If a custom domain is configured later, these directories become `/server/`,
`/learn/` and `/website/` on that domain.


Dashboard registers `scripts/report-sections/dashboard.json`. Its app and local
chips package results and HTML coverage are uploaded as `dashboard-test-report`;
the focused Chrome journey is uploaded separately as `dashboard-browser-report`.
Main publishes both under `/lovat/dashboard/` and `/lovat/dashboard/browser/` only
after the aggregate gate succeeds. Unit failures still retain diagnostic artifacts
without replacing the published successful site. Native/device and sandbox Auth0
checks remain separate release evidence, not public unit-test success claims.

## Publishing setup

1. Select **GitHub Actions** in repository **Settings → Pages**.
2. Permit deployments from `main` in the `github-pages` environment.
3. Set repository variable `TEST_REPORT_PAGES_ENABLED=true`.

These settings are already enabled for HighlanderRobotics/lovat. Setting the
variable to `false` stops deployments and restores path-filtered main test runs
without removing the last published site.

## Updates, artifacts and failures

When publishing is enabled, every main push runs Server, Website (including its
production browser job) and Learn, even if only one app changed. PR jobs remain
path-filtered. This deliberately produces a complete set from the same commit:
a partial deployment cannot erase another application's reports or label an
older report as current.

When Server is selected, its unit checks, integration tests, and production
image build run in parallel. The integration job applies migrations to disposable
PostgreSQL, checks migration drift, and produces the combined coverage and test
reports. The final Monorepo CI gate requires all three jobs to pass. Logs produced
by failed Server jobs are retained as separate diagnostic artifacts.

CI uploads `server-test-report`, `learn-test-report`, `learn-browser-report`,
`website-test-report` and `website-browser-report` as ordinary Actions artifacts
with 14-day retention. They remain available on failures if generated; browser
traces/screenshots are retained only for failed tests. Unit reports include
coverage and test names; Learn additionally provides JUnit XML.

A separate **Publish test reports** workflow reacts to completion of **CI**.
Only successful pushes to `main` in this repository's `.github/workflows/ci.yml`
can reach the Pages write job. PRs, failed/cancelled CI runs and superseded
sources cannot deploy. The publisher downloads reports from the triggering run
ID (not the latest arbitrary artifact), validates the complete report set, and
packages one Pages artifact. `revision.json` uses the triggering run's tested
SHA, not the downstream workflow's default-branch SHA. The publish job is
serialized; it rechecks the current main revision just before deploying so
older queued runs do not overwrite newer reports. A failure remains visible as
a separate workflow failure and leaves the last successful public site intact.
The privilege policy keeps Pages writes out of CI and checks the publishing
trigger and exact-run artifact binding.

### Railway isolation is not assumed

The downstream workflow keeps a Pages failure out of the required **Monorepo
CI** result. It does not establish that Railway ignores Pages. [Railway's Wait
for CI docs](https://docs.railway.com/deployments/github-autodeploys) say it
evaluates every GitHub Actions check suite attached to the deployment commit.
[GitHub's workflow-run docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
describe `workflow_run`'s own SHA as the default-branch tip, which may equal
the producing CI SHA (or be a newer SHA). A firing or skipped publishing
workflow may still contribute a suite. No live Railway policy was changed by
moving this job.

Before applying Wait for CI in production, inspect
`GET /repos/{owner}/{repo}/commits/{sha}/check-suites` for the exact source push,
and query each Pages run's `head_sha` and `check_suite_id` using the GitHub Actions
run API. In an isolated Railway preview, verify a failing and a passing source
SHA, plus a stalled or failing Pages publication after passing CI. Also verify
a cancelled CI run cannot slip through when any other workflow succeeds.
Record whether suites overlap and whether Pages delays/skips deployment. If
release isolation is not proven, keep the live toggle off and use a reviewed,
explicit promotion of the exact successfully tested SHA rather than treating
workflow separation as the release gate.

## Local preview and verification

- Server: run `npm run test:coverage` with disposable PostgreSQL/Redis, then
  `npm run test:report:preview` from `apps/server`.
- Learn: `npm run test:coverage` produces `test-report/index.html` and `unit.xml`;
  `npm run test:image` produces the Playwright report in `playwright-report/`.
- Website: `npm run test:coverage` produces `test-report/` including HTML coverage;
  `npm run test:image` produces `playwright-report/`.

To preview the complete layout, stage the three test reports under `server/`,
`learn/`, `website/` in an untracked temporary directory; copy each app's
Playwright report to its `browser/` child. Run
`node scripts/prepare-pages-reports.mjs /path/to/staged-reports` and serve that
directory with any static HTTP server. Pass the tested SHA as the optional
second argument to label a staged set explicitly. The script rejects missing reports and
symbolic links. Run `node --test scripts/prepare-pages-reports.test.mjs` to
verify assembly, path handling and failure behavior without dependencies.

Reports contain source code and synthetic fixture output from this public
repository. Keep real credentials, personal data and scouting data out of tests
and logs. Failed browser artifacts are not publicly deployed because publishing
requires passing tests with retries disabled.

## Collection reports

Collection publishes its Jest/Node summary, JUnit XML and critical-module coverage at `/lovat/collection/`. Its main job runs whenever report publishing is enabled so all reports still come from one successful commit. Native candidate Maestro results upload as separate diagnostic artifacts from the manually dispatched release workflow; they are not represented as passing by the public unit report. Optional app sections are registered in `scripts/report-sections/`, allowing independent framework PRs to extend the report directory without replacing existing apps.
