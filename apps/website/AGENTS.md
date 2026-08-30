# Website agent instructions

- Use Node.js 20.19.6 from `.nvmrc` and install with `npm ci`.
- Run `npm run check`, `npm run lint`, and `npm run build` when relevant, and report the documented baseline failures separately.
- Production build and server routes require provider-managed private environment values.
- Treat Slack signature verification, contact forms, account deletion, redirects, and signed Server requests as security-sensitive.
- Keep private environment variables in Netlify or local untracked files; never expose them through client-side environment modules.
- Netlify uses `apps/website` as its base directory.
