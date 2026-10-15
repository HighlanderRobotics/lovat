# Website agent instructions

- Use Node.js 20.19.6 from `.nvmrc` and install with `npm ci`.
- Run `npm run check`, `npm run lint`, and `npm run build` when relevant, and report the documented baseline failures separately.
- Builds require no private values; server routes read provider-managed private environment values at runtime.
- Treat Slack signature verification, contact forms, account deletion, redirects, and signed Server requests as security-sensitive.
- Keep private environment variables in the deployment provider or local untracked files; never expose them through client-side environment modules.
- Railway uses repository root `/` and config `/apps/website/railway.json` so the build includes `CHANGELOG.md`. Netlify retains `apps/website` as its base directory. Railway runs adapter-node; NETLIFY=true selects the retained rollback adapter.
