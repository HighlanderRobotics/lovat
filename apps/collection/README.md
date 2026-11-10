# Lovat Collection

Collection is the Expo and React Native client used by scouters to record match events, complete post-match observations, retain reports offline, and upload them to Lovat Server.

Return to the [monorepo README](../../README.md).

## Platforms

Collection supports iOS and Android only. Web is not a supported target, and there is no web build.

## Prerequisites

- Node.js 24.6.0 and npm 11.5.1 (`nvm use` from this directory)
- Expo and EAS tooling
- macOS, Xcode 27, CocoaPods, and an iOS 27 simulator or connected iPhone
- Android Studio, JDK 21, Android platform/build-tools 37, and NDK 27.1.12297006

## Commands

```bash
npm ci
npm start
npm run ios
npm run android
npm run lint
npm run format:check
npm run ts:check
```

Copy `.env.example` to an appropriate local environment file and set `EXPO_PUBLIC_API_URL` to the desired Server authority. `EXPO_PUBLIC_*` values are included in client builds and must never contain secrets.

Android has known pre-existing issues tracked as LVT-217. Offline report migrations and QR-code fallback are compatibility-sensitive.

## Native setup and preflight

From a fresh checkout in `apps/collection`, run:

```bash
nvm install
nvm use
npm ci
npm run preflight -- tooling
npm run check:dependencies
npm run preflight -- ios
# Or, with ANDROID_HOME and JAVA_HOME configured:
npm run preflight -- android
```

Preflight is read-only. It exits nonzero for missing prerequisites and prints an exact correction for every failure. `all` checks both platforms; `--json` emits machine-readable results. Android also requires an authorized device or running emulator. The license-file check is preliminary: review all licenses with `sdkmanager --licenses` before building; Gradle may require additional package licenses. See [Expo's native environment setup](https://docs.expo.dev/get-started/set-up-your-environment/).

Collection uses Expo managed native generation. `npm run ios` and `npm run android` generate native projects when absent. After SDK or plugin changes, regenerate with `npx expo prebuild --clean` **in a disposable checkout**, then run the platform command. This replaces generated native folders; preserve any local native edits first. Do not commit generated `ios/` or `android/` projects. Commit native settings in `app.json`, config plugins, or the versioned `patches/` folder. `npm ci` reapplies the menu header patch needed by SDK 58.

Fresh-launch verification: use a new simulator/emulator (do not erase a personal device), launch the app, and confirm welcome → team → scouter → tournament → home without exceptions. Relaunch with a valid saved scouter and verify schedules load. Archive/delete that test scouter on a test server, refresh, and verify scouter selection returns. Repeat offline and reconnect to ensure cached identity is retained until the roster can be verified. The automated startup tests cover absent/deleted identities, offline fetches, failed storage reads, legacy migration failures, roster timeouts, and selection changes during a pending roster response. Router regression tests verify that finishing onboarding, submitting a report, and resetting settings clear the previous navigation stack. Failed storage reads fall back to defaults without clearing saved reports.

## Dependency checks

```bash
npm run check:dependencies
npm run --silent audit:dependencies > dependency-audit.json
npm audit --omit=dev --json
npm test
```

CI checks the SDK dependency map, runs startup/preflight regression tests, and rejects high/critical npm advisories. It retains the full audit JSON as `collection-dependency-audit` for 14 days. Expo Doctor is an additional native compatibility check: `npx expo-doctor`.

The 2026-11-06 SDK 58 alignment reduced the full audit from 16 to 13 moderate advisories; both full and production-only audits had **zero high or critical** findings. The production-only report contained five moderate entries through Expo CLI/fingerprint's `glob`/`minimatch` build tooling. Development findings additionally include TypeScript ESLint and the optional ngrok tunnel helper. A production dependency classification alone does not establish runtime reachability: the CLI paths execute during development/builds, rather than in the native app. Keep untrusted glob patterns and untrusted source trees out of build tooling. No high/critical exception was accepted. Do not apply `npm audit fix --force`: its suggested Expo 52 downgrade would undo iOS 27 lifecycle support. Recheck the generated audit artifact because advisories change over time.

## Versioning

Versions are written as `YEAR.MAJOR.MINOR (BUILD)`, for example `26.1.0 (14)`.

- `YEAR` is the competition season the app is built for, so `26` is the 2026 season.
- `MAJOR` increases for a major feature, such as a new scouting flow.
- `MINOR` increases for a smaller feature or a fix.
- `BUILD` is the build number in parentheses and increases for every TestFlight upload, even when the version itself did not change.

Only change `YEAR.MAJOR.MINOR` when cutting a release. Individual features and fixes shipped as TestFlight builds keep the current version; the build number carries the difference. TestFlight builds and version bumps get their own commits, separate from unrelated work. Name the build in the commit and add a `TestFlight-Build: <number>` trailer so the history shows which upload a change belongs to. `version` and `ios.buildNumber` in `app.json` produce that version. Android uses the same `version` with a separate `android.versionCode`, which must increase for every Play upload. EAS does not increment the build number for these profiles, so set it before each upload and keep it ahead of the latest build in App Store Connect.

## iOS release builds

Build release iOS candidates with **Xcode 27**. Expo SDK 58 builds for the iOS
27 SDK and generates the UIScene lifecycle (`SceneDelegate.swift` and a
`UIApplicationSceneManifest` entry), so it can launch on iOS 27. The earlier
Xcode 27 crash (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`)
came from Expo SDK 54 starting React Native from the legacy app-delegate window;
verify the first build after this upgrade still launches on an iOS 27 device.

- Cloud builds use the `training-testflight` profile, which pins `ios.image` to
  `macos-tahoe-26.6-xcode-27.0`. Keep the pin when creating store builds.
- `eas build --local` ignores `ios.image` and compiles with the Mac's selected
  Xcode. Check `xcodebuild -version` first; use Xcode 27 or a cloud build.
- The build number in the uploaded binary can differ from `ios.buildNumber` in
  `app.json`; confirm it in the built app's `Info.plist` or the EAS build details.
- If EAS Submit reports that an App Store Connect API key is required, upload a
  local archive with Xcode Organizer, or a cloud-built `.ipa` with Transporter.
