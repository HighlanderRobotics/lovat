# Lovat Dashboard

The Dashboard is Lovat's Flutter client for analysis, match review, scouting management, predictions, and picklists. It targets web, iOS, Android, and desktop platforms.

Return to the [monorepo README](../../README.md).

## Commands

```bash
flutter pub get
flutter analyze
dart format --output=none --set-exit-if-changed .
flutter run -d chrome
flutter build web
```

The app consumes the authenticated Lovat Server API. `packages/chips_input` is an app-local path dependency. Application test coverage is currently limited.

At the migration baseline, Flutter 3.35.4 analysis reports one informational lint and `flutter pub get` rewrites five lockfile entries. These pre-existing toolchain issues are documented in `../../docs/migration/baseline-before.md` and must not be hidden by migration changes.
