# Dashboard agent instructions

- Use Flutter 3.35.4 for analysis and deployment compatibility. Formatting CI currently uses Flutter 3.16.2.
- Run `flutter pub get`, `flutter analyze`, and `dart format --output=none --set-exit-if-changed .` for code changes.
- `packages/chips_input` is an app-local dependency, not a monorepo shared package.
- Do not commit lockfile drift caused only by switching Flutter versions. The migration baseline documents five such entries.
- Preserve web, Android, iOS, and desktop behavior unless a change explicitly narrows platform support.
- Treat API response shapes, Auth0 configuration, deep links, versions, and season metrics as cross-app contracts.
- Keep Netlify credentials and signing material in provider-managed environments.
