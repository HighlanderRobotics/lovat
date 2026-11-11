# Lovat test report hosting

GitHub Pages hosts static reports for all three web applications. No live
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

CI uploads `server-test-report`, `learn-test-report`, `learn-browser-report`,
`website-test-report` and `website-browser-report` as ordinary Actions artifacts
with 14-day retention. They remain available on failures if generated; browser
traces/screenshots are retained only for failed tests. Unit reports include
coverage and test names; Learn additionally provides JUnit XML.

The publish job waits for all report producers and the Monorepo CI gate to
succeed, downloads artifacts from that exact workflow run, validates every
required index, then packages one combined Pages artifact. Only main pushes
publish. PRs and failed runs leave the last successful public site intact.
`revision.json` identifies the published commit. The publish job is serialized
with the existing `test-report-pages` concurrency group.

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
directory with any static HTTP server. The script rejects missing reports and
symbolic links. Run `node --test scripts/prepare-pages-reports.test.mjs` to
verify assembly, path handling and failure behavior without dependencies.

Reports contain source code and synthetic fixture output from this public
repository. Keep real credentials, personal data and scouting data out of tests
and logs. Failed browser artifacts are not publicly deployed because publishing
requires passing tests with retries disabled.

## Collection reports

Collection publishes its Jest/Node summary, JUnit XML and critical-module coverage at `/lovat/collection/`. Its main job runs whenever report publishing is enabled so all reports still come from one successful commit. Native candidate Maestro results upload as separate diagnostic artifacts from the manually dispatched release workflow; they are not represented as passing by the public unit report. Optional app sections are registered in `scripts/report-sections/`, allowing independent framework PRs to extend the report directory without replacing existing apps.
