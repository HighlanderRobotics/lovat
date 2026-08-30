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
