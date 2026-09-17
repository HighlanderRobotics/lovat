# Railway web hosting

Learn, Dashboard web and Website run as independent services in the existing Lovat Railway project. Use an isolated PR environment before promoting to production. The root railway.json remains owned by API.

| Service | Root directory | Config file (repository absolute) | Health check |
| --- | --- | --- | --- |
| learn | /apps/learn | /apps/learn/railway.json | /healthz |
| dashboard | /apps/dashboard | /apps/dashboard/railway.json | /healthz |
| website | /apps/website | /apps/website/railway.json | /healthz |

All services build their app-local Dockerfile, listen on PORT (8080 by default), and use app-specific watch paths. No volumes are needed. Enable Railway CDN for static delivery. Learn has short shared HTML caching and immutable hashed assets. Dashboard revalidates stable Flutter filenames on every request; do not override this with a blanket CDN TTL. Website caches adapter-served static assets only; dynamic responses use private, no-store.

## Preview configuration

Use the PR environment created for the GitHub pull request. Add these services only there during validation. In the base environment, use Railway service domains and reference variables when preparing automatic previews for future PRs. Do not reuse production database URLs, production signing keys, Slack webhooks, or email keys in previews.

- Dashboard build variables: LOVAT_WEBSITE_URL=https://${{website.RAILWAY_PUBLIC_DOMAIN}} and LOVAT_API_BASE=https://${{api.RAILWAY_PUBLIC_DOMAIN}}. Docker builds require this explicitly. Native builds retain the existing production default. Redeploy Dashboard when its API URL changes.
- Website: ORIGIN=https://${{RAILWAY_PUBLIC_DOMAIN}}, LOVAT_API_BASE=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}, and LOVAT_SIGNING_KEY=${{api.LOVAT_SIGNING_KEY}}. Use the actual configured API port; do not assume one.
- Learn build variable: PUBLIC_WEBSITE_URL=https://${{website.RAILWAY_PUBLIC_DOMAIN}}. This rewrites Markdown/MDX links and the header; rebuild when the URL changes.
- Website public runtime variables: PUBLIC_LEARN_URL=https://${{learn.RAILWAY_PUBLIC_DOMAIN}}, PUBLIC_DASHBOARD_URL=https://${{dashboard.RAILWAY_PUBLIC_DOMAIN}}, PUBLIC_WEBSITE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}. These control navigation, server redirects, and metadata.
- API link variables: BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}} and LOVAT_WEBSITE=https://${{website.RAILWAY_PUBLIC_DOMAIN}} for OpenAPI, Slack callbacks, and verification emails.
- Website integration variables: SLACK_SIGNING_SECRET, SLACK_WEBHOOK and RESEND_KEY. Populate only sandbox integration credentials for PRs. Missing credentials intentionally prevent external operations. The build requires no secrets because private values are read at runtime.
- API: CORS_ALLOWED_ORIGINS=https://${{dashboard.RAILWAY_PUBLIC_DOMAIN}}. This adds only the exact preview origin to the existing lovat.app allowlist.
- Auth0: authorize the exact Dashboard PR domain in the web application's Allowed Web Origins / Callback URLs / Logout URLs as appropriate. Do not allow arbitrary Railway domains. The existing web client ID is in apps/dashboard/lib/constants.dart. Login is not validated until this setup and an interactive sign-in complete.

Verify the PR API has isolated Postgres and Redis before using forms or authentication. Check outgoing integration variables and scheduled jobs inherited from the base environment. Keep normal NODE_ENV=production; do not bypass CORS by enabling development mode.

## Validation

The Web hosting images workflow builds all three production images and runs scripts/test-web-hosting.mjs. It checks health, Learn redirect/404s, Dashboard deep links and Flutter cache headers, and Website origin validation and unsigned Slack rejection. The contact smoke check uses the existing bot trap and sends no external message. Run it against preview URLs too, then check search, images and an authorized test login manually.

## Production cutover and rollback

After PR validation, configure equivalent production services and real runtime integration credentials, then move existing custom domains. Production ORIGIN must use the canonical public website URL, not the Railway service domain. Preserve redirects between apex/www and existing auth URLs.

Website retains its Netlify adapter when NETLIFY=true for rollback. Dashboard's release workflow retains Netlify until repository variable DASHBOARD_HOSTING=railway and secret RAILWAY_DASHBOARD_PRODUCTION_TOKEN (production-scoped Railway project token) are configured. The Railway step deploys the release worktree after the version bump so web and APK versions agree. Set production Dashboard LOVAT_API_BASE=https://api.lovat.app and LOVAT_WEBSITE_URL=https://lovat.app. Set production Learn PUBLIC_WEBSITE_URL=https://lovat.app and Website public URL variables to their corresponding canonical domains. Avoid a second automatic GitHub deployment for that release-managed service; use the release workflow as production deploy authority.

Keep Netlify sites available until DNS and integrations are verified. Roll back by restoring DNS and setting DASHBOARD_HOSTING back to netlify. A PR deployment alone does not cut production traffic over.
