# Baseline before monorepo migration

Captured from disposable clones at the approved revisions in `source-revisions.md`. Dependency and build products were created only in disposable worktrees.

| App | Command | Tool version | Result | Evidence |
|---|---|---|---|---|
| Server | `npm ci` | Node 22.20.0; npm 10.9.3 | PASS | Installed 419 packages; engine warning for `posthog-node`; 3 high-severity audit findings. |
| Server | `npm run build` | Node 22.20.0 | PASS | TypeScript compilation completed. |
| Server | `npm test` | Node 22.20.0 | PASS | Script completed; it currently runs TypeScript compilation. |
| Server | `npm run lint` | Node 22.20.0 | PASS | 0 errors and 77 warnings. |
| Collection | `npm ci` | Node 24.6.0; npm 11.5.1 | PASS | Installed 1,019 packages; 38 audit findings, including 2 critical. |
| Collection | `npm run lint` | Node 24.6.0 | PASS | ESLint completed with no findings. |
| Collection | `npm run format:check` | Node 24.6.0 | PASS | All matched files use Prettier style. |
| Collection | `npm run ts:check` | Node 24.6.0 | PASS | TypeScript compilation completed. |
| Dashboard | `flutter pub get` | Flutter 3.35.4; Dart 3.9.2 | PASS WITH DRIFT | Dependency resolution completed but downgraded five locked packages in the disposable clone. The source lockfile was not modified. |
| Dashboard | `flutter analyze` | Flutter 3.35.4; Dart 3.9.2 | FAIL: application | One existing `prefer_conditional_assignment` informational issue in `lib/reusable/stale_refresh_builder.dart:143`. |
| Dashboard | `dart format --output=none --set-exit-if-changed .` | Dart 3.9.2 | PASS | 126 files checked; 0 changed. |
| Dashboard | `flutter build web` | Flutter 3.35.4; Dart 3.9.2 | PASS | Web artifact built; Wasm dry-run emitted existing `dart:ffi` compatibility warnings from `win32`. |
| Website | `npm ci` | Node 20.19.6; npm 10.8.2 | PASS | Installed 288 packages; 22 audit findings. |
| Website | `npm run check` | Node 20.19.6 | FAIL: application | `svelte-check` found 4 errors and 13 warnings in 11 files. |
| Website | `npm run lint` | Node 20.19.6 | FAIL: application | Prettier reported style issues in 14 files and warned that `pluginSearchDirs` is unknown. |
| Website | `npm run build` | Node 20.19.6 | BLOCKED: environment | Build requires the private `LOVAT_SIGNING_KEY` environment variable. No credential was supplied for migration testing. |

Known exclusions: Collection Android (LVT-217), Collection web (LVT-220), Collection runtime null-scouter behavior (LVT-219), native mobile builds, and full Server integration requiring PostgreSQL, Redis, authentication configuration, or The Blue Alliance.

No frozen source worktree was modified. Dashboard lockfile drift occurred only in its disposable baseline clone and must be reproduced or avoided consistently during post-migration verification.
