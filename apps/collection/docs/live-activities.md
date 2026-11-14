# Scouting Live Activities

Collection's iPhone build includes a native ActivityKit module and WidgetKit
extension. They implement the approved compact face/binoculars design and the
expanded purple mascot, next assignment, and three following assignments. The
artwork is exported from the Figma file and bundled locally as vector assets.

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
`com.frc8033.lovatcollection.push-type.liveactivity`. Debug builds register
sandbox tokens; signed release/TestFlight builds register production tokens.

The phone registers its ActivityKit update and push-to-start tokens through
`POST /collection/live-activities`. The native module observes token rotations
and uploads them directly, including when iOS wakes the app in the background.
Server checks the team code, scout UUID, active scout, and registration ownership.
Registration data expires in the existing environment-prefixed Redis namespace
after eight hours without renewal. No database migration is needed.

Server checks registered devices every 30 seconds against the worker-imported
canonical match results and current team-scoped scouting shifts. It sends state
changes and a heartbeat at most every three minutes. Actual timeliness also
depends on provider updates, worker imports, APNs delivery, and iOS budgets;
this isn't a buzzer-time guarantee. Apple may delay or drop pushes. Activities
mark data stale after five minutes without an update and invite the user to
open Collection. A completed schedule ends the activity immediately. Disabling,
resetting, changing scout/tournament/server, or entering training retires the old
activity and registration. Dismissing an activity suppresses recreation until the
user refreshes real assignments in Debug, re-enables activities, or changes
configuration. Without server credentials, local refresh
and previews work, but continuous locked/background updates do not.

## Verification on a signed iPhone

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
