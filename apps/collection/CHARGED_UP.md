# Charged Up mock-game Collection

This branch replaces the Collection game with 2023 Charged Up. Server, Dashboard,
and the public website are unchanged. Version 26.0.6 identifies this Collection
build; each new report also carries `gameYear: 2023`.

Design source: [Lovat Collection 2026 Mock Game](https://www.figma.com/design/Zf13XBt683AU91MCH4pM8N/Lovat-Collection-2026-Mock-Game?node-id=2262-164).
Data source: [Lovat UX, Tab 2](https://docs.google.com/document/d/1kAoc2EyL2JJakALNKU1hmclrKOirr6k7iaGpWLsQ5Fg/edit?tab=t.wudamy5mrxnh).

## Scouting

Select a starting position with the vertical drag bar before starting. Values are
integers from 0 to 100, measured from the top of the alliance grid in the default
field orientation. The four pre-match field pieces cycle through unknown, cone,
and cube. They are saved as `fieldPieces` in display order.

Select one of three scoring areas, then a cell in its 3 by 3 grid. The areas use
columns A–C, D–F, and G–I respectively; rows are 1–3 from top to bottom. Select
cone or cube in the header before recording a score. This labeling was confirmed
with the user; the original A–H range in the brief was corrected to A–I.

Undo reverses the most recent event, including movement and held-piece state.
The stop menu supports ending, restarting, and exiting an active match. Exiting
and restarting require confirmation before discarding the in-progress report.

Match timing uses 15 seconds of autonomous and 135 seconds of teleop, with
endgame beginning at 120 seconds elapsed and the match ending at 150 seconds.
See the [2023 FIRST game manual](https://firstfrc.blob.core.windows.net/frc2023/Manual/HTML/2023FRCGameManual.htm).

## Report contract for later Server and Dashboard work

The full validated contract is in `lib/collection/ChargedUp.ts`. New events are
objects with `time` (seconds since start), `action`, and `location`, rather than
2026 numeric tuples. Scoring events add `scoringLocation` (A1–I3). Only the initial
`START_POSITION` event adds `position` (0–100). Collection does not generate points.

Post-match data includes robot roles, 1–5 driving and defence ratings, percentage
of active defence, intake sources and pieces, crossing capabilities, endgame
result, notes, and breakdown description. `links` and `coopertition` describe the
whole alliance. `activeDefensePercentage` is 0 for all camping and 100 for all
active defence.

Practice match and schedule support is integrated from the Collection portions of
`jackshim415/collection-improvements` before the game replacement. It uses the
existing match-schedule and check-match request contracts, including practice
match types. Server endpoints from that branch are deliberately not included.

The existing upload endpoint and QR transport remain in use. The current Server
and Dashboard are not compatible with the new report schema until their planned
updates are made. Failed uploads remain in local history and can be retried later;
reports are saved before a network upload begins. No live upload was used in tests.
Existing 2026 history keeps its original schema and numeric-event migrations;
2023 events bypass those migrations.

## Validation

Use Node 24.6.0, then `npm ci`, `npm test`, `npm run lint`,
`npm run format:check`, and `npm run ts:check`. `npm run build` checks web bundling;
it does not establish native device compatibility. The existing web export has a
runtime script-loading issue (`import.meta` in a classic script) and references a
missing favicon. A temporary generated-output workaround was used for visual QA;
no workaround or preview route is part of the source changes.

### iPhone preview build

Run `npm run build-ios-preview` for an internally signed IPA using the existing
registered-device provisioning profile. Local Xcode 27 builds use two Expo config
plugins: one aligns pod resource targets with React Native's iOS minimum, and one
corrects the context-menu dependency's subtitle availability guards to iOS 16.
These preserve the app's existing iOS 15.1 minimum, signing configuration, and
dependency versions. Revisit the availability patch when updating that dependency;
it fails explicitly if the expected source has changed.
