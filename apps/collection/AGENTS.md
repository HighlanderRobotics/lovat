# Collection agent instructions

- Use Node.js 24.6.0 from `.nvmrc` and install with `npm ci`.
- Run `npm run lint`, `npm run format:check`, and `npm run ts:check` for code changes.
- Run native builds only when the task requires them; macOS and Xcode are required for iOS.
- Build release iOS candidates with Xcode 27 (the `training-testflight` profile pins `macos-tahoe-26.6-xcode-27.0`). Expo SDK 58 generates the UIScene lifecycle, which fixes the earlier Xcode 27 launch crash; verify the first upgraded build on an iOS 27 device. `eas build --local` uses the Mac's Xcode regardless of `ios.image`.
- Never put secrets in `EXPO_PUBLIC_*`; those values are compiled into client builds.
- Report events, offline migrations, QR-code fallback, deep links, and upload payloads are compatibility-sensitive.
- Preserve EAS project ownership, identifiers, profiles, and signing configuration.
- Follow the `YEAR.MAJOR.MINOR (BUILD)` versioning convention: the year or season, a major feature, a minor feature or fix, then the build number in parentheses. Change `YEAR.MAJOR.MINOR` only when cutting a release, not for every feature or fix. Increment `ios.buildNumber` for every TestFlight upload and `android.versionCode` for every Play upload.
- Give each TestFlight build and version bump its own commit, separate from unrelated work, and indicate the build in the message (for example a `TestFlight-Build: 13` trailer).
- Collection supports iOS and Android only; web is not a supported target. Android has documented pre-existing issues; do not conceal them by weakening checks.
