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

For static hosting, set the base directory to `apps/learn`, build command to `npm run build`, and publish directory to `dist`. No deployment provider is configured by this import.
