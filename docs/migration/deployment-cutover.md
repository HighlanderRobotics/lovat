# Deployment cutover

No provider change is authorized by this document alone. Every external change requires explicit approval and a recorded rollback target.

## Pending items

- [ ] Attach or create the approved GitHub repository and confirm visibility.
- [ ] Push reviewed `main` and namespaced tags.
- [ ] Observe the stable CI gate before configuring required checks.
- [ ] Recreate or transfer required GitHub secrets without recording values here.
- [ ] Cut over Railway Server staging with repository root `apps/server`.
- [ ] Validate the Dashboard build-only dry run before enabling production deployment.
- [ ] Cut over Netlify Dashboard with artifact `apps/dashboard/build/web`.
- [ ] Validate Netlify Website preview with base directory `apps/website`.
- [ ] Validate EAS Collection with project root `apps/collection`.
- [ ] Cut over production services one at a time with rollback SHAs.
- [ ] Archive source repositories only after all replacements are healthy.

## Evidence

Not yet recorded.

## Railway Server

- Configure the existing service with repository root `apps/server`.
- Reconfirm provider-managed environment variables without copying values into Git.
- Preserve the `/status` health check and current Prisma build and pre-deploy behavior.
- Validate staging first with health, authentication, analysis, cache, and disposable report checks.

## Netlify Dashboard

- Preserve `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` as repository secrets.
- Run the manual build-only workflow before creating or pushing `production`.
- Confirm the next build number exceeds `dashboard-pre-monorepo-production`.
- Promote an accepted `main` commit to `production`; the workflow commits its version bump to `production` with `[skip ci]`.
- Merge or cherry-pick that version-only commit back to `main` before the next release so branches do not drift.

## Netlify Website

- Set base directory to `apps/website`, build command to `npm run build`, and publish directory to `build` relative to that base.
- Reconfirm all private environment variables in Netlify without exposing values.

## EAS Collection

- Reconnect with project root `apps/collection`.
- Preserve owner, project ID, bundle identifier, Android package, profiles, and signing credentials.
