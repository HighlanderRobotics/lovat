# Learn agent instructions

This app owns the Astro/Starlight user guides. Follow the root instructions.

- Run `npm ci` and `npm run build` inside `apps/learn`.
- Preserve the npm lockfile and independent app boundary.
- Guides live in `src/content/docs/guides`; images live in `src/assets`.
- Keep sidebar slugs in `astro.config.mjs` aligned with guide filenames.
- Check the owning app before changing documented behavior or season details.
- Do not commit `.astro/`, `dist/`, or `node_modules/`.
