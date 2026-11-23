# Scouting Live Activities

Collection's iPhone build includes a native ActivityKit module and WidgetKit
extension. Both phases use the same binoculars logo: 27 points in the compact
island and 50 points in expanded and Lock Screen layouts. On shift, the layout
shows the next assignment and three following assignments alongside the logo.
The logo artwork is exported from Figma and bundled locally.

Live Activities are enabled by default. After onboarding, opening Collection
starts one automatically when the selected scout has pending assignments at
the selected tournament. Before their next shift it shows the current match
and next shift; during the shift it shows the match and the **team to scout**,
not the scout's own team. The official backend match status advances completed
matches. A submitted report also removes that scout's finished assignment.
Training sessions never start a real activity.

Match labels are `Q28` for qualifiers, `P12` for playoffs, and `F2` for the
second match in an official final series. Finals are identified from the
canonical match's `FINAL` competition level, not by assuming that a particular
playoff ordinal is always a final. Practice matches aren't included in shifts.

## Debug menu

Open the menu button at the top left of Home, then **Debug**. No special account
role is required. Controls allow enabling/disabling activities, previewing
before-shift/on-shift states, refreshing real assignments, and ending the
activity. Previews use sample data, are labeled Preview, and don't register
for background pushes or change scouting data.

The screen reports unavailable native support, iPhone authorization, assignment
fetch errors, push-registration errors, and whether Server push credentials are
configured. Expo Go and Android don't contain the iOS native module; the menu
explains this instead of crashing.

### Home Screen widget demo

Open **Debug → Widget demo** to compare Small (170 × 170 points) and Medium
(364 × 170 points) with Before shift and On scout sample states. The small
layout omits the alliance table. These controls never start a Live Activity or
change assignments. The shared `widget-demo.json` fixture supplies the same
sample matches, assigned teams, alliances, time, and colors to both renderers.

On iOS 17+, the native widget gallery also includes **Collection → Scouting
demo** in both sizes. Add it from the Home Screen, then hold it and choose
**Edit Widget** to select its shift state. Each installed widget keeps its own
configuration, so both states can be compared side by side. Native widgets
adapt to the size iOS provides rather than assuming one phone model.

Both the gallery description and in-app demo identify the data as sample-only.
The sample timeline is static; Home Screen widgets are not yet connected to real
assignments or Server push delivery. The existing Live Activity controls are
separate. A native rebuild is required to add the Home Screen widget provider.

## Native build and signing

Use the pinned Node version, `npm ci`, then `npx expo prebuild --platform ios`.
The config plugin creates and embeds `ScoutingLiveActivity.appex`, copies the
shared ActivityAttributes source and vector assets, and enables Live Activities
and the push entitlement. Expo autolinking discovers the local module under
`modules/lovat-live-activities`. Generated `ios/` and `android/` projects aren't
committed. A new native build is required; this can't be delivered by a JS-only
update or Expo Go.

The extension uses the bundle ID
`com.frc8033.lovatcollection.ScoutingLiveActivity`. The plugin declares it for EAS
extension signing. Enable Push Notifications for the main Collection App ID in
Apple Developer and regenerate provisioning profiles when needed. Preserve the
existing app identifiers and EAS ownership. iOS 16.2+ supports locally started
activities and push updates; push-to-start requires iOS 17.2+. Dynamic Island
requires an iPhone with Dynamic Island; other supported iPhones use Lock Screen
activities. Simulator previews don't request real APNs tokens.

## Server background updates

Configure `APNS_TEAM_ID`, `APNS_KEY_ID`, and `APNS_PRIVATE_KEY` on Server using an
Apple APNs signing key. Store the `.p8` private key only in the hosting provider's
secret manager, never in Collection, `EXPO_PUBLIC_*`, Git, or the widget bundle.
The fixed APNs topic is
`com.frc8033.lovatcollection.push-type.liveactivity`. The provisioning profile's
`aps-environment` selects sandbox or production, independently of Debug/Release
optimization. Local development-signed Release builds still use sandbox;
distribution/TestFlight builds use production. Debug displays the selected Apple
push environment. An unreadable embedded profile prevents registration rather
than guessing the wrong endpoint.

The phone registers its ActivityKit update and push-to-start tokens through
`POST /collection/live-activities`. The native module observes token rotations
and uploads them directly, including when iOS wakes the app in the background.
Server checks the team code, scout UUID, active scout, and registration ownership.
Registration data expires in the existing environment-prefixed Redis namespace
after eight hours without renewal. No database migration is needed.

Server checks registered devices every 30 seconds against the worker-imported
canonical match results and current team-scoped scouting shifts. It sends state
changes and a heartbeat at most every three minutes. Starts, ends, and changed
assignments use APNs priority 10; unchanged heartbeats use priority 5. Actual
timeliness depends on provider updates, worker imports, APNs delivery, and iOS budgets;
this isn't a buzzer-time guarantee. Apple may delay or drop pushes. Activities
mark data stale after five minutes without an update and invite the user to
open Collection. A completed schedule ends the activity immediately.

iOS ends any Live Activity after eight hours, which is shorter than a full
competition day. Server records when each activity first registered its update
token. After 7.5 hours it sends a push-to-start for a replacement, then ends the
old activity, and extends the registration so it doesn't expire before the
replacement uploads its token. Late token uploads from the replaced activity are
ignored. This requires a push-to-start token (iOS 17.2+); on older iOS the
activity ends at eight hours and returns the next time Collection is opened.
The replacement start shows the standard "Scouting shift" alert. Collection
ignores the removal of ended or replaced activities, so only swiping away a
live activity suppresses recreation. Disabling,
resetting, changing scout/tournament/server, or entering training retires the old
activity and registration. Dismissing an activity suppresses recreation until the
user refreshes real assignments in Debug, re-enables activities, or changes
configuration. Without server credentials, local refresh
and previews work, but continuous locked/background updates do not.

## Verification on a signed iPhone

Before-shift and on-shift layouts share the same binoculars logo. Older saved
mascot-style values and push attributes remain compatible but no longer change
the artwork. The Debug menu retains both phase previews without mascot options.

1. Open Debug, preview both states, and inspect compact, expanded, and Lock Screen
   layouts. Check that Q/P/F labels and the assigned team's number are readable.
2. Switch to real assignments. Verify the selected scout's next match/team,
   including a gap before a later shift and a final-series assignment.
3. Lock the phone, import a completed match or submit a synthetic scout report,
   and verify the activity advances through a Server APNs update.
4. Edit the scout's upcoming shift and verify the correct team/station updates.
5. Disable activities and verify no new activity appears after a backend update.
   Repeat after changing scouts/tournament and entering training.
6. Disconnect the phone and wait five minutes. Verify the stale indicator; reopen
   Collection to recover. Also test disabled Live Activities in iPhone Settings.

Automated tests cover state selection, match labels, assigned-team selection,
team ownership, token validation, and the public sidebar/preview controls. Xcode
compilation and simulator previews don't prove real APNs delivery; the signed
device/background checks above must be completed before release.

The native signing-environment regression checks can run without a simulator:

```bash
xcrun swiftc modules/lovat-live-activities/ios/PushEnvironment.swift \
  test/native/PushEnvironmentTests.swift -o /tmp/lovat-push-environment-tests
/tmp/lovat-push-environment-tests
```

An optional argument points to a local development build's
`Collection.app/embedded.mobileprovision`, verifying that its real profile maps
to sandbox. Do not commit that profile.

## Simulator widgets stuck on gray placeholders

The Home Screen demo uses an App Intent for its shift-state picker. In the local
iOS 27.2 simulator, installing a build made with `CODE_SIGNING_ALLOWED=NO` caused
the configuration service to fail with `Unable to get LNAction from intent` and
`No AppIntent in timeline(for:with:)`. The JSON was present, but WidgetKit could
not request its timeline. Compilation alone did not catch this failure.

Keep local signing enabled when building simulator demos. If installing an
existing unsigned build manually, apply an ad hoc signature to the extension
first and then the app, after any development-only Info.plist edits:

```bash
# Run from the directory containing the built Collection.app.
codesign --force --sign - Collection.app/PlugIns/ScoutingLiveActivity.appex
codesign --force --sign - Collection.app
xcrun simctl install booted Collection.app
```

This simulator signature does not need a paid developer account and does not
enable device signing or APNs. After reinstalling, reopen the widget gallery.
Verify actual match numbers in both sizes and switch the installed widget's
Shift state to On scout; a successful build or gray placeholder is insufficient.
