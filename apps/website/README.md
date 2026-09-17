# Lovat Website

The Website is Lovat's SvelteKit public site. It also contains server routes for Slack interactions, contact and update forms, account-deletion requests, and selected operational pages.

Return to the [monorepo README](../../README.md).

## Commands

```bash
npm ci
npm run dev
npm run check
npm run lint
npm run build
npm run preview
```

Production server routes require provider-managed values such as `SLACK_SIGNING_SECRET`, `SLACK_WEBHOOK`, `RESEND_KEY`, and `LOVAT_SIGNING_KEY`. Never expose them to browser code or commit them.

The migration baseline records existing Svelte check and formatting failures. Railway builds do not require private environment configuration; provide it at runtime. Netlify must use `apps/website` as the repository base directory.

## Railway hosting

See [Railway web hosting](../../docs/railway-web-hosting.md) for app-local Docker builds, PR environment variables, validation, and cutover.
