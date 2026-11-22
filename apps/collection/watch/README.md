# Collection Apple Watch companion

**Work in progress.** This is an initial implementation tested in paired simulators. Physical-device sign-in sync and notification delivery still need verification before release.

This SwiftUI app shows the selected Collection scouter's match assignments, team numbers, alliances, and published match times. It calls the existing Lovat API directly after the paired iPhone shares its setup. The iPhone app remains Expo/React Native.

## Run locally

Configure `EXPO_PUBLIC_API_URL` with an HTTPS Server address as described in the [Collection README](../README.md). From `apps/collection`, use Node.js 24.6.0 and run:

```sh
npm ci
npx expo prebuild --platform ios --no-install
cd ios
pod install
open Collection.xcworkspace
```

Select the `Collection` scheme to install the iPhone app and its embedded `LovatWatch` companion. Select the `LovatWatch` scheme to run the watch app. Use a paired iPhone/Apple Watch simulator or physical devices; the watch requires watchOS 10 or newer. For physical devices, select the existing Lovat signing team for both targets and provision `com.frc8033.lovatcollection.watchkitapp`. The plugin also declares the watch target to EAS credential collection using [Expo's target-signing metadata](https://docs.expo.dev/build-reference/app-extensions/). This change preserves Collection's existing bundle identifier, project ownership, and signing profiles.

Expo Go cannot include this native module or the watch target; use a native development build. `plugins/withLovatWatch.cjs` recreates the watch target during prebuild, and Expo autolinking includes the local `modules/lovat-watch` iPhone bridge. Generated `ios/` and `android/` projects stay untracked. Edit Swift source under `watch/Sources`, then rerun prebuild to copy updates into the generated target. After adding or removing Swift files, regenerate with `npx expo prebuild --clean --platform ios --no-install` and reinstall pods.

## Sign-in and offline behavior

Complete Collection onboarding and select a scouter and tournament on iPhone. The bridge sends the team code, team number, selected scouter, selected tournament, API authority, and completed match identifiers using WatchConnectivity. It waits for persisted stores to hydrate before sending anything. Training mode clears watch setup to avoid confusing practice sessions with competition assignments.

The watch stores the setup in its device-only Keychain and stores only assignments and reminder bookkeeping in its local schedule cache. It uses the same `X-Team-Code` authentication as Collection, filters the response to the selected scouter, and accepts HTTPS API authorities. HTTP development servers are not supported by this companion. Redirects are rejected to keep the team code on its intended authority.

Scouter, team code, server, or tournament changes clear the old cache and pending reminders. Resetting Collection sends a signed-out context. WatchConnectivity delivers the latest context when connectivity permits: an offline watch cannot learn about a phone reset immediately. Opening Collection and the watch app resynchronizes them. The watch also refreshes directly from the API when opened and requests opportunistic background refresh.

## Reminders and API compatibility

Deploy the accompanying Server API change to enable automatic time-based reminders. `GET /collection/schedules/{tournament}` retains its existing fields and adds nullable `scheduledTime`, `predictedTime`, `actualTime` (ISO 8601 UTC strings), and `status` per match. These come from the canonical Match linked to TeamMatchData. Missing legacy relations return null values. There are no database schema or authentication changes. Older Collection clients ignore the new fields; the watch can display an older server's assignments without times.

Enable **5-minute reminders** on the watch and allow notifications. Reminders use `predictedTime` when available, otherwise `scheduledTime`. Missing times produce no automatic reminder. Tap a match to choose its expected start time when none is published, or override a published time. These overrides stay local to the watch and do not change the team's schedule. Remove a chosen time from the same screen to return to published timing.

Finished, canceled, started, and locally scouted matches do not produce reminders. Assignments received within five minutes of a future match get an immediate reminder. The watch replaces pending reminders after each successful refresh and tracks fired reminders to avoid duplicate alerts.

Background refresh and WatchConnectivity delivery are controlled by watchOS. Reminders use the last successfully fetched times (or your explicit override) and may be stale during event delays or network loss. This first version does not include server push notifications or a complication.

## Verification

```sh
swift test --package-path watch
npm run ts:check
npm run lint
npm run format:check
node --test test/*.test.mjs
xcodebuild -project ios/Collection.xcodeproj -target LovatWatch \
  -configuration Debug -sdk watchsimulator -jobs 2 \
  SYMROOT=/tmp/lovat-watch-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
xcodebuild -workspace ios/Collection.xcworkspace -scheme Collection \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/lovat-iphone-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
```

The Swift package exercises the shared schedule decoder, scouter filtering, time selection, reminder eligibility, and session identity checks without a watch. Simulator builds must retain ad-hoc signing (`CODE_SIGNING_ALLOWED=YES`). Disabling signing also removes the simulated app-identifier entitlement, which makes Keychain access fail with `errSecMissingEntitlement` even when the watch is unlocked. The native target build verifies SwiftUI and WatchConnectivity compilation; running the signed build verifies access to secure storage.

Before release, test on a paired iPhone and watch: initial setup, changing scouters/tournaments/server, resetting Collection while disconnected and reconnecting, offline schedule access, notification permission denial, a real future reminder, delayed match times, duplicate refreshes, and completed assignments. Simulator builds and unit tests do not verify physical WatchConnectivity or notification delivery.
