# Dashboard agent instructions

- Use Flutter 3.41.0 for analysis, native tests and deployment; the iOS UIScene APIs require this SDK. Formatting CI currently uses Flutter 3.16.2.
- Run `flutter pub get`, `flutter analyze`, and `dart format --output=none --set-exit-if-changed .` for code changes.
- `packages/chips_input` is an app-local dependency, not a monorepo shared package.
- Preserve the lockfile generated with the pinned Flutter 3.41.0 SDK. Do not commit drift caused by switching to other SDK versions; the historical migration baseline used five different SDK-owned entries.
- Preserve web, Android, iOS, and desktop behavior unless a change explicitly narrows platform support.
- Treat API response shapes, Auth0 configuration, deep links, versions, and season metrics as cross-app contracts.
- Keep hosting credentials and signing material in provider-managed environments.
