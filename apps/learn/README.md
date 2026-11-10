# Lovat Learn

User guides for Lovat Dashboard and Collection, built with Astro, Starlight, MDX, and Svelte.
Imported from `MangoSwirl/lovat-learn`; see [import provenance](../../docs/migration/learn-import.md).

Use Node.js 22 and run commands from this directory:

```bash
npm ci
npm run dev
npm run build
npm run preview
```

Development runs at `http://localhost:4321`. Production output is `dist/`.
Guides live in `src/content/docs/guides`, images in `src/assets`, and sidebar configuration in `astro.config.mjs`.

For static hosting, set the base directory to `apps/learn`, build command to `npm run build`, and publish directory to `dist`. The app-local Dockerfile and repository `.railway/railway.ts` configure Railway hosting; see below.

## Railway hosting

See [Railway web hosting](../../docs/railway-web-hosting.md) for app-local Docker builds, PR environment variables, validation, and cutover.

## Testing

Use Node 22.20.0 and run `npm ci`. `npm test` runs isolated Node tests for direct and reference link rewriting, preview destinations, paths/query/fragment preservation and protocol boundaries. `npm run test:coverage` enforces 100% line, branch and function coverage for the link plugin using Node’s built-in coverage. `npm run test:ci` typechecks browser tests, enforces that plugin coverage and runs the full Astro/Pagefind build.

For browser coverage, run `npx --no-install playwright install --no-shell chromium` once, start Docker, then run `npm run test:image`. This builds the production Caddy image with a local preview Website URL and checks the root redirect, real 404 status, every configured sidebar destination, local images and built-site search. The script binds an ephemeral loopback port and removes the container even on failure. No credentials or live services are required. Browser requests outside the local origin are blocked.

`npm run test:e2e` can target an already running Caddy build with `TEST_BASE_URL=http://127.0.0.1:PORT`; build with `PUBLIC_WEBSITE_URL=http://127.0.0.1:4322`. It deliberately requires Caddy's production redirect/404 behavior rather than the Astro development server. CI runs both layers on Learn and workflow changes, fails on any test failure, and uploads traces/screenshots/reports only on failure. To debug, use `npx --no-install playwright show-report`.

Add plugin regression cases in `test/site-links.test.mjs` and user journeys in `e2e/`. Sidebar test destinations come directly from `astro.config.mjs`. Related work: LVT-270, LVT-271; shared CI adoption: LVT-273.
