# Magnolia consumer migration

This branch adopts the published Magnolia rewrite in Lovat. It is separate from [Magnolia controls PR #3](https://github.com/HighlanderRobotics/magnolia-ui/pull/3), whose additional controls remain in an unreleased minor Changeset. Those unpublished exports are not used here.

| Consumer | Pinned dependency | Integration |
| --- | --- | --- |
| Website | `@highlanderrobotics/magnolia-svelte@0.2.0` | Replace the GitHub tarball and imports; use Svelte 5 callback props; explicitly mark submit buttons; own global reset, dark theme, fonts and main landmarks; remove obsolete install-time font patch |
| Collection | `@highlanderrobotics/magnolia-react-native@0.2.0`, `@highlanderrobotics/magnolia-tokens@0.2.0` | Add the dark provider; share palette, text primitives and fields through existing app entry points; preserve multiline submit/scroll/ref behavior and bundled fonts |
| Learn | `@highlanderrobotics/magnolia-starlight@0.1.0` | Use canonical light/dark Starlight colors; preserve Roboto and docs layout; keep native Pagefind search visible on mobile and the monochrome logo readable in light mode |
| Dashboard | `magnolia_ui` at `fb6a12d6c19e3ab27780b31aa56d13c40bbebbf0`, `packages/flutter` | Use light/dark Material factories and canonical FRC colors; retain existing ColorScheme aliases/getters; correct helper text contrast when the light theme is active |

Collection adoption is incremental: its composite Button, Checkbox/SelectionIndicator, FRC Icon and scouting widgets stay app-owned. In particular, composite button rows preserve their existing view/text layout. Navigation, safe areas, offline state, persisted reports, timer behavior, EAS configuration and version/signing settings are unchanged. Dashboard charts, picklists, routes and authentication stay app-owned. There is no Server/API/report-schema/database change and no cross-app source import.

## Verification on 2026-11-13

Website used Node 20.19.6. Before migration, check/lint/build/unit tests passed. After migration:

- `npm ci`, `npm run check`, `npm run lint`, `npm run build`, `npm test`, `npm run test:changelog`, and `npm run test:training` pass. There are 52 unit tests. The same 13 pre-existing Svelte warnings in eight files remain; no check errors were introduced.
- `TEST_BASE_URL=http://127.0.0.1:4187 npm run test:e2e` passes all 20 desktop/mobile cases against the production build and synthetic fixture server, with outbound requests blocked. Coverage includes SSR/hydration, axe, navigation, verification, routing and pit display. The new DOM test uses the real package to verify callback identity/cancellation and native form submission.

Collection used Node 24.6.0. Baseline and migrated `npm run ts:check`, `npm run lint`, `npm run format:check` pass. `npm test` passes 115 legacy tests and 31 Jest tests with coverage thresholds (91.68% statements, 76.81% branches, 96.36% functions, 92.53% lines). The new consumer tests cover field refs, callbacks, disabled inputs, multiline behavior and font/color compatibility. Jest's CommonJS harness maps the real ESM token entry; no shared-control mock is used. Production Metro exports also pass:

```sh
CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform ios --output-dir /private/tmp/lovat-magnolia-ios-export
CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /private/tmp/lovat-magnolia-android-export
```

Learn's baseline and migrated `npm run build` pass, indexing 16 pages. Local Chromium checks at 1280px and 393px verify both system color schemes, expected background colors, viewport fit, axe, working search results for “scouting”, Escape dismissal and no page errors. The mobile check found an existing header rule hiding Search; that rule is replaced while retaining Starlight's sidebar toggle. These local browser checks are additional evidence, not a committed Learn test harness. Existing Astro deprecation and missing-site sitemap warnings remain.

Dashboard used the required Flutter 3.41.0 SDK. `flutter pub get`, `flutter analyze`, `flutter test` (61 tests), `flutter build web`, and `dart format --output=none --set-exit-if-changed .` pass. New tests cover palette/getter compatibility, helper-text contrast and 200% text-scale interaction. Lockfile changes are limited to the immutable package and its required Flutter lower bound; there is no SDK-version drift. The JavaScript web build retains existing service-worker/WASM-readiness warnings; a WASM build is not claimed.

`./scripts/check-structure.sh` and `git diff --check` pass. Original local Collection app.json/eas.json edits are preserved in the original checkout and absent from this PR.

## Review and rollout

No PR merge or deployment is performed. iOS/Android Metro exports and widget tests do not replace signed native builds, VoiceOver/TalkBack checks or representative on-device scouting and Dashboard picklist workflows. Those remain LVT-368/consumer acceptance gates before a v1.0 release. The first future OIDC npm publish must also verify provenance; initial bootstrap was manual.

Rollback restores each app's manifest/lockfile and integration files together by reverting its migration commit. For Website, restore the old font-patch script, postinstall and Docker copy together with the legacy dependency; do not mix old install hooks with the new package. Collection rollback keeps persisted report data intact. Dashboard rollback restores pubspec/lockfile and theme compatibility imports. Learn rollback restores its customCss entry and previous palette. Keep the legacy Magnolia repository available until LVT-369's explicit archival gate passes.
