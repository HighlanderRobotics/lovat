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

The Website service must use repository root `/` and config file `/apps/website/railway.json` so its Docker build can include the root changelog. Build locally from the repository root:

```bash
docker build -f apps/website/Dockerfile -t lovat-website .
```

## Changelog page

`/changelog` is generated from the root [CHANGELOG.md](../../CHANGELOG.md) during the Website build. Edit that file, using `## Month YYYY` headings, `### Feature` headings, and Markdown bullets. An empty Unreleased section is hidden; feature sections under Unreleased are shown.

The Vite plugin reads the file directly, watches it during development, renders Markdown with raw HTML disabled, and rewrites repository-relative links to GitHub. The generated content is bundled and prerendered, so the deployed server requires no Markdown file or GitHub requests at runtime. Rebuild the Website to publish changelog edits. CI and Railway watch the root file as well as Website sources. Netlify's existing app base directory works with the full repository checkout; include root changelog changes if you configure a custom build-ignore rule.
