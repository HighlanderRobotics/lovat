# Deployment cutover

No provider change is authorized by this document alone. Every external change requires explicit approval and a recorded rollback target.

## Pending items

- [x] Attach the approved GitHub repository and confirm its existing visibility.
- [x] Push reviewed `main` and namespaced tags.
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

- Repository: <https://github.com/HighlanderRobotics/lovat>
- Visibility observed after publication: public (unchanged during migration)
- First published `main`: `7eb4b80c2befbdfc5230dc6d756e296eea884d25`
- Published migration tags: 30 namespaced source, branch-tip, and release tags
- First-push Actions result: no run was created while the empty repository established its default branch and workflows
- Stable CI run: pending the next `main` push

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
