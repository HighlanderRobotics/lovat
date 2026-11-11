# Lovat Website

The Website is Lovat's SvelteKit public site. It also contains server routes for Slack interactions, contact and update forms, account-deletion requests, and selected operational pages.

Return to the [monorepo README](../../README.md).

## Commands

```bash
npm ci
npm run dev
npm run check
npm run test:changelog
npm run test:contact
npm run lint
npm run build
npm run preview
```

Magnolia is pinned to a GitHub archive of the commit recorded in the lockfile. The archive includes its compiled `dist` files, so npm can install it without preparing the library's development dependencies. Keep this archive URL pinned when updating Magnolia; a Git dependency makes npm install those development tools again and can fail before the Website builds.

Production server routes require provider-managed values such as `SLACK_SIGNING_SECRET`, `SLACK_WEBHOOK`, `RESEND_KEY`, and `LOVAT_SIGNING_KEY`. Never expose them to browser code or commit them.

The migration baseline records existing Svelte check and formatting failures. Railway builds do not require private environment configuration; provide it at runtime. Netlify must use `apps/website` as the repository base directory.

## Contact form reCAPTCHA

The contact form requires a Google reCAPTCHA **v2 “I'm not a robot” checkbox** key pair.
Register the production hostname (and localhost for development) in the
[Google reCAPTCHA admin console](https://www.google.com/recaptcha/admin/create).
Set these variables in the hosting provider's runtime environment, or in an untracked
`.env.local` for development:

- `RECAPTCHA_SITE_KEY`: the public site key, returned only to the contact page.
- `RECAPTCHA_SECRET_KEY`: the private verification key; used only by the server.

The server verifies every submission with Google's
[verification endpoint](https://developers.google.com/recaptcha/docs/verify) before
forwarding it to Slack. Missing configuration, invalid or expired tokens, and verification
outages block submission. Keep domain validation enabled in the reCAPTCHA console.
Test successful submission, expired challenges, and retry after a failed request before
publishing. No keys are required to build the site.

## Railway hosting

See [Railway web hosting](../../docs/railway-web-hosting.md) for Docker builds, PR environment variables, validation, and cutover.

The Website service must use repository root `/` and applied settings from `/.railway/railway.ts` so its Docker build can include the root changelog.

Check these settings in each PR environment too. An inherited `/apps/website`
root hides the repository-level files and causes Docker `COPY` steps for
`apps/website` and `CHANGELOG.md` to fail before the application build starts.

Build locally from the repository root:

```bash
docker build -f apps/website/Dockerfile -t lovat-website .
```

Magnolia is installed from an archive of the commit recorded in the lockfile.
That commit includes its built `dist` files. Using the archive avoids npm's Git
dependency preparation, which resolves the library's development dependencies
independently and can fail even when the website lockfile is unchanged.

## Changelog page

`/changelog` is generated from the root [CHANGELOG.md](../../CHANGELOG.md) during the Website build. Edit that file, using `## Month YYYY` headings, `### Feature` headings, and Markdown bullets. An empty Unreleased section is hidden; feature sections under Unreleased are shown.

The Vite plugin reads the file directly, watches it during development, renders Markdown with raw HTML disabled, and rewrites repository-relative links to GitHub. The generated content is bundled and prerendered, so the deployed server requires no Markdown file or GitHub requests at runtime. Rebuild the Website to publish changelog edits. CI and Railway watch the root file as well as Website sources. Netlify's existing app base directory works with the full repository checkout; include root changelog changes if you configure a custom build-ignore rule.

## Testing

Use the Node version in `.nvmrc` (20.19.6), then `npm ci`.

- `npm test`: Vitest server tests in Node plus isolated Svelte Testing Library component tests in jsdom.
- `npm run test:watch`: rerun focused tests while editing.
- `npm run typecheck:test`: typecheck tests and their Svelte imports with generated SvelteKit route types.
- `npm run test:coverage`: V8 text/HTML/lcov reports in `test-report/coverage/`, with enforced 80% lines/statements/functions and 75% branches across the explicitly listed initial critical modules. This is a scoped baseline, not whole-app coverage. Expand the include list as features gain tests.
- `npm run test:ci`: test typecheck, coverage gate and existing changelog/training regression suites.
- `npm run build && npm run test:e2e`: Playwright against the built adapter-node application and a synthetic local API. Install Chromium once with `npx --no-install playwright install --no-shell chromium`.
- `npm run test:image`: build and test the production Docker image on an ephemeral loopback port. Requires Docker. Application and fixture API run on a dedicated network. A test-only preload rejects server fetches outside the fixture API, and browser routing rejects external requests. Containers are removed on exit.

CI runs the fast suites under Node 20 and a separate blocking image/browser job under Node 24. Chromium and its runner are pinned together by the lockfile. Browser HTML reports upload after every run; traces and screenshots are retained only on failure. Coverage uploads separately. The aggregate `Monorepo CI` gate includes browser results.

Server tests reset synthetic environment values, timers and fetch stubs for every test; unexpected fetch calls fail immediately. Tests cover CSRF hooks, exact HMAC signing, Slack timestamp/signature failures and approve/reject actions, CAPTCHA/delivery failures, honeypots, verification outcomes and redirect behavior. No real Slack/email requests or production bypasses are used. Browser tests block external requests and cover SSR, hydration, keyboard/mobile navigation, WCAG A/AA axe checks, redirects, verification and a pit display using `test/fixtures/pit.json` (invented teams, no production data).

Put server cases in `test/*.node.test.ts`, Svelte cases in `test/*.dom.test.ts`, and built-site journeys in `e2e/`. Keep fixtures synthetic. The local browser server uses a test-only fetch preload allowing only its fixture API; Docker mounts the same preload and allows only its fixture API origin. A custom `TEST_BASE_URL` must be local and already configured with the fixture API and public preview URLs.

Accessibility automation does not replace manual keyboard/screen-reader review. Keyboard menu interaction is automated; broader assistive-technology review remains a release task. Related issues: LVT-267, LVT-268, LVT-269; shared CI adoption: LVT-273.

The browser suite exposed an existing invalid font shorthand in the pinned Magnolia dependency. `postinstall` applies a small, idempotent source patch that uses valid CSS and falls back to the reduced icon font if the external full font is unavailable. Installation fails with a review instruction if upstream changes the patched code; remove the patch when the upstream fix is adopted. The suite also checks that in-paragraph Download help links remain visibly underlined.

`npm run test:coverage` also generates a static Vitest overview in `test-report/`; its coverage view uses relative routing so it works at `/lovat/website/`. CI uploads `website-test-report` and `website-browser-report` for every applicable run, including failures when reports exist. Successful main runs publish [Website reports](https://highlanderrobotics.github.io/lovat/website/) and [browser results](https://highlanderrobotics.github.io/lovat/website/browser/). See `docs/test-report-hosting.md` for the combined Pages publishing gate.
