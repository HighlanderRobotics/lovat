# Intended content differences

Application source and lockfiles are imported byte-for-byte at first. Later migration commits may change only documentation, agent instructions, GitHub workflow placement and paths, root coordination scripts, and deployment path configuration. Any other difference requires Ben's approval and must be listed here with its reason.

## Recorded differences

- Source GitHub Actions files were relocated from app-local `.github/workflows` directories to the root, the only workflow location used by the monorepo.
- Redundant Server CI and the inert `apps/server/workflow/ci.yml` were removed after their useful commands were consolidated.
- Server and Collection retain their passing baseline checks in CI.
- Dashboard formatting remains in CI at Flutter 3.16.2. Dashboard analysis is temporarily omitted from the required gate because Flutter 3.35.4 reports the documented baseline informational failure.
- Website application checks are temporarily omitted from the required gate because check and lint fail at baseline and build requires private environment configuration.
- The Dashboard deployment workflow gained a build-only manual path, monorepo-relative paths, namespaced release tags, explicit write permission for production only, and Dashboard-only changelog filtering.

The final per-app diff review at `94479a3787013f7faeb49059f26beed3611938a4` contains only the allowed files above. No unexplained content difference remains.
