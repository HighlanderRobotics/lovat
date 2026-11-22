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

Use Flutter **3.41.0** (the formatter job remains on **3.16.2**). Install
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

`Dashboard native integration` is a manual Android and iOS simulator workflow using the
same integration target and fixture (`bash tool/run_native.sh`, or
`bash tool/run_native.sh ios <simulator-id>`). Android requires verified KVM
access; both jobs retain native diagnostics even on failure. This runs a
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
unit/package coverage, Chrome or either native platform fails. The native jobs
use the same source and assigned version as the release candidate. They exercise
a debug integration build; signed APK/IPA acceptance remains a manual release
check (LVT-266).

Before a mobile release, verify the actual signed versioned APK/IPA on a disposable
physical device: sandbox Auth0 login/logout and redirect, account/server changes,
camera and QR permission denial/retry, scan a synthetic Collection QR, background
and relaunch persistence, offline stale-data/recovery, narrow-screen navigation,
and upgrade from the previous release. Record device/OS, source SHA, app version
and outcome in LVT-266. Never use production scouting or strategy data in public
artifacts. Native/sandbox Auth0 acceptance remains pending until these checks run.

The owner, evidence template and platform-by-platform pending acceptance matrix
are in [manual release checks](docs/manual-release-checks.md).

Flutter 3.41.0 is pinned across app CI, native/release workflows, CodeQL and
Docker because the iOS app already uses the UIScene lifecycle APIs. The SDK
upgrade intentionally reconciles SDK-owned lockfile entries.

The reusable native workflow also builds Linux and macOS release targets. Its
Android/iOS journeys and desktop builds use the same resolved candidate version;
release jobs wait for every platform result. Web compilation and the Chrome
journey remain in app CI and build-only release validation.

### On-device strategy with Apple Intelligence

The AI Strategy Assistant offers **Apple Intelligence · On device** on eligible iPhones, iPads, and Macs running iOS/iPadOS 26+ or macOS 26+. It checks the system model at runtime and explains when the device is unsupported, Apple Intelligence is disabled, or its model is still downloading. Supported devices default to local generation; Claude remains an explicit cloud option. Older OS versions and other platforms retain the cloud option.

The app-local `packages/apple_strategy` Flutter plugin calls `SystemLanguageModel.default` through a native method channel. It does not use Private Cloud Compute, Siri, or a separately trained model. The iOS deployment minimum remains 15.0. Foundation Models is weak-linked and every native access is guarded by an OS availability check. On-device generation never falls back to Claude automatically.

Selecting a tournament loads an authenticated, source-filtered match snapshot from the API with `local=true`. Local evidence contains report counts, average driver/defense ratings, and at most three recent notes per team, with bounded note lengths. Generation then uses that loaded snapshot without another network request, so it can work offline while that page remains loaded. It does not refresh the schedule offline; refresh the match and data before using the brief at the field. The NorCal synthetic example supports both engines.

This integration uses Apple's existing system model; no custom model or adapter has been trained. Apple's legacy Foundation Models adapter toolkit does not support iOS 27. Any future custom training needs reviewed input/strategy pairs and a separate quality evaluation. Siri/App Intents and spoken responses are not implemented in this version.

Native verification should cover a physical Apple Intelligence-compatible iPhone with Apple Intelligence enabled, a device with it disabled, and an older supported OS. Simulator compilation does not establish model availability or strategy quality on a phone. For the local path, load a match, disconnect networking, generate, and verify there is no Claude POST request. Review drafts with a drive-team mentor; the model is not trained on the REBUILT rulebook.
