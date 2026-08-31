# Baseline after monorepo migration

Captured at commit `94479a3787013f7faeb49059f26beed3611938a4`. Checks used the same versions, order, and environment classification as `baseline-before.md`. Dashboard ran in a detached worktree so its known lockfile drift could not affect `main`.

| App | Command | Result | Parity |
|---|---|---|---|
| Server | `npm ci` | PASS | Matches baseline installation and audit profile. |
| Server | `npm run build` | PASS | Matches baseline. |
| Server | `npm test` | PASS | Matches baseline TypeScript compilation behavior. |
| Server | `npm run lint` | PASS with 77 warnings | Matches baseline exactly. |
| Collection | `npm ci` | PASS | Matches baseline installation and audit profile. |
| Collection | `npm run lint` | PASS | Matches baseline. |
| Collection | `npm run format:check` | PASS | Matches baseline. |
| Collection | `npm run ts:check` | PASS | Matches baseline. |
| Dashboard | `flutter pub get` | PASS WITH DRIFT | Reproduced the same five lockfile downgrades only in the disposable worktree. |
| Dashboard | `flutter analyze` | FAIL: application | Reproduced the same single `prefer_conditional_assignment` issue at the same source line. |
| Dashboard | `dart format --output=none --set-exit-if-changed .` | PASS | 126 files checked and 0 changed, matching baseline. |
| Dashboard | `flutter build web` | PASS | Reproduced the same non-fatal Wasm `dart:ffi` warnings and built successfully. |
| Website | `npm ci` | PASS | Matches baseline installation and audit profile. |
| Website | `npm run check` | FAIL: application | Reproduced 4 errors and 13 warnings in 11 files. |
| Website | `npm run lint` | FAIL: application | Reproduced formatting issues in 14 files and the `pluginSearchDirs` warning. |
| Website | `npm run build` | BLOCKED: environment | Reproduced the missing private `LOVAT_SIGNING_KEY` configuration failure. |

## Repository verification

- `scripts/check-structure.sh`: PASS.
- `git fsck --full`: PASS.
- `actionlint .github/workflows/*.yml`: PASS.
- Tracked generated-directory and signing-file scan: PASS, no matches.
- Nested workflow scan: PASS, no app-local workflow remains.
- Gitleaks: 2,242 commits and approximately 8.24 MB scanned. The 447 findings occur only in the same five reviewed source files and are the same false-positive classes recorded before import.
- Worktree after dependency cleanup: clean.

## Content parity

Import merge commits:

- Server: `16d4ee2381c50ca6a183589821494c24aa9a6c54`
- Dashboard: `95eba7dbb0b8e74e988c431e4adf7bbd31d23fc6`
- Collection: `b5dd78a82d376f8ead7b68c5d164ea876903631d`
- Website: `5743f4c747e2e08ffa2dae452be646046e1b511e`

Explicit `git diff --name-status <import-merge>..HEAD -- apps/<app>` review found only app READMEs, app-local `AGENTS.md` files, and removal of superseded workflows. No application source, asset, schema, lockfile, native-project, or runtime configuration changed.
