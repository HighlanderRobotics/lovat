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

## Railway hosting

See [Railway web hosting](../../docs/railway-web-hosting.md) for app-local Docker builds, PR environment variables, validation, and cutover.

## Behavioral testing and reports

Use Flutter **3.35.4** (the formatter job remains on **3.16.2**). Install
app dependencies with `flutter pub get`, then run:

```sh
python3 tool/run_tests.py
flutter analyze
dart format --output=none --set-exit-if-changed .
```

The Python standard-library runner executes the app's retained and new tests,
then installs and tests the local `chips_input` package separately. It writes
`test-report/index.html`, machine JSON events, annotated HTML line coverage,
and package results under `test-report/packages/chips_input/`. Test failures
and missing/below-floor critical coverage make the command fail while retaining
HTML diagnostics. Floors in `tool/coverage_floors.json` apply to response caching,
the HTTP client, stale refresh state, and the error view; whole-app coverage is
shown honestly and is not presented as complete feature coverage.

The new suites exercise real HTTP request headers, ETags/304 responses, malformed
cache records, durable cache flush/reload, identity/server invalidation, stale
in-flight responses, mutation bodies, picklist serialization, loading/error/retry
and stale-data widget states, narrow screens, and chip interactions. HTTP clients,
token providers and clocks are optional constructor dependencies; production
continues to use its normal HTTP and Auth0 implementations. Persisted API bodies
are invalidated before the first authenticated request and when token or Server
URL changes. Tokens are never written into cache storage.

### Chrome integration

Install Node 24.6.0, Chrome and its matching ChromeDriver, put `chromedriver` on
PATH, and set `CHROME_EXECUTABLE` if Chrome is installed outside its usual path.
Then run `python3 tool/run_browser.py`. CI pins Chrome/ChromeDriver 141.0.7390.37.
The runner starts only a localhost synthetic API and ChromeDriver, captures their
logs, and always writes `test-report/browser/index.html` before returning its exit
status. The integration target is separate from production `main.dart`; it injects
a synthetic token and uses production widgets and API methods. It selects and
persists a tournament, renders rankings, loads analysis, drags a mutable picklist,
and reopens it to verify the server retained its order. This is a focused journey
through production views, rather than a full production bootstrap/Auth0 login.

PR CI uploads both unit/package and Chrome artifacts, including failure reports.
Successful main runs publish them together at
`https://highlanderrobotics.github.io/lovat/dashboard/`, with Chrome results at
`/lovat/dashboard/browser/`. Only synthetic fixtures and test diagnostics are
public. Shared report staging requires every registered app report from the same
run and retains Server, Learn and Website paths.

### Native and release checks

`Dashboard native integration` is a manual Android emulator workflow using the
same integration target and fixture (`bash tool/run_native.sh`). This runs a
Flutter debug integration build on API 35 with `adb reverse`; it does not certify
a signed release APK. Use a disposable emulator because the target clears its
app preferences. iOS simulator developers can run the fixture with
`node tool/fixture_api.mjs`, then `flutter test integration_test/app_journey_test.dart
-d <simulator-id> --dart-define=LOVAT_API_BASE=http://127.0.0.1:9878` with Xcode and
simulator dependencies installed. Android debug builds permit cleartext only for loopback fixture hosts; production network
policy, Auth0 configuration and signing assets are unchanged.

The existing build/deploy workflow now runs both report suites after assigning
the candidate build number and before building/deploying from that checkout.
Artifacts record the source SHA and candidate version. Deployment is blocked if
unit/package coverage or Chrome fails. Native integration is an additional manual
check, not a required production job yet (LVT-266).

Before a mobile release, verify the actual signed versioned APK/IPA on a disposable
physical device: sandbox Auth0 login/logout and redirect, account/server changes,
camera and QR permission denial/retry, scan a synthetic Collection QR, background
and relaunch persistence, offline stale-data/recovery, narrow-screen navigation,
and upgrade from the previous release. Record device/OS, source SHA, app version
and outcome in LVT-266. Never use production scouting or strategy data in public
artifacts. Native/sandbox Auth0 acceptance remains pending until these checks run.
