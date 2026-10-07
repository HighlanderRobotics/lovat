# Lovat Website

The Website is Lovat's SvelteKit public site. It also contains server routes for Slack interactions, contact and update forms, account-deletion requests, and selected operational pages.

Return to the [monorepo README](../../README.md).

## Commands

```bash
npm ci
npm run dev
npm run check
npm run test:changelog
npm run lint
npm run build
npm run preview
```

Production server routes require provider-managed values such as `SLACK_SIGNING_SECRET`, `SLACK_WEBHOOK`, `RESEND_KEY`, and `LOVAT_SIGNING_KEY`. Never expose them to browser code or commit them.

The migration baseline records existing Svelte check and formatting failures. Railway builds do not require private environment configuration; provide it at runtime. Netlify must use `apps/website` as the repository base directory.

## Railway hosting

See [Railway web hosting](../../docs/railway-web-hosting.md) for Docker builds, PR environment variables, validation, and cutover.

The Website service must use repository root `/` and config file `/apps/website/railway.json` so its Docker build can include the root changelog. Build locally from the repository root:

```bash
docker build -f apps/website/Dockerfile -t lovat-website .
```

## Changelog page

`/changelog` is generated from the root [CHANGELOG.md](../../CHANGELOG.md) during the Website build. Edit that file, using `## Month YYYY` headings, `### Feature` headings, and Markdown bullets. An empty Unreleased section is hidden; feature sections under Unreleased are shown.

The Vite plugin reads the file directly, watches it during development, renders Markdown with raw HTML disabled, and rewrites repository-relative links to GitHub. The generated content is bundled and prerendered, so the deployed server requires no Markdown file or GitHub requests at runtime. Rebuild the Website to publish changelog edits. CI and Railway watch the root file as well as Website sources. Netlify's existing app base directory works with the full repository checkout; include root changelog changes if you configure a custom build-ignore rule.
