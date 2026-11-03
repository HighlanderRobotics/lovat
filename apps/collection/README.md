# Lovat Collection

Collection is the Expo and React Native client used by scouters to record match events, complete post-match observations, retain reports offline, and upload them to Lovat Server.

Return to the [monorepo README](../../README.md).

## Platforms

Collection supports iOS and Android only. Web is not a supported target, and there is no web build.

## Prerequisites

- Node.js 24.6.0
- Expo and EAS tooling
- macOS and Xcode for iOS builds
- Android Studio and the Android SDK for Android builds

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

## Versioning

Versions are written as `YEAR.MAJOR.MINOR (BUILD)`, for example `26.1.0 (13)`.

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
