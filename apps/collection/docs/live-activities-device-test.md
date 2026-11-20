# Live Activities device test — November 20, 2026

Test device: Theodore's iPhone 17, iOS 27.2.1. Built from
`codex/collection-live-activities` with Xcode 27.2, Release configuration,
development signing, and `https://api.lovat.app`. App version/build: 26.1.0 (18).
This was a local device install, not a TestFlight upload.

## Observed on the physical phone

| Check                                        | Result                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Signed installation and launch without Metro | Pass                                                                                                               |
| Live Activities authorization                | Allowed                                                                                                            |
| Before-shift compact Island                  | Logo and Q28 displayed                                                                                             |
| Before-shift expanded Island                 | Now Q18, Next Shift Q28, time, and Preview label fit                                                               |
| On-shift compact/expanded Island             | Q28 and scout team 8433; following Q39, P1, F1 assignments fit                                                     |
| On-shift Lock Screen while actually locked   | Logo, primary assignment, and following assignments displayed                                                      |
| Background preview after five minutes        | Compact ellipsis; expanded “Open Collection to refresh”                                                            |
| End Live Activity and disable                | Switch off; native status reports no active activity                                                               |
| Re-enable                                    | Switch on; real-assignment refresh attempted                                                                       |
| Installed medium Home Screen widget          | Sample match table displayed; scouting badge shows 8433 without a comma                                            |
| Signing environment after the fix            | Debug displays sandbox on the development-signed Release build                                                     |
| In-app widget demo                           | Small/Medium and Before shift/On scout controls render; small omits the table and shows assigned teams in On scout |

## Bug fixed during testing

The installed Release build's signed `aps-environment` is `development`, but
registration previously chose production using `#if DEBUG`. The app now reads
the embedded provisioning profile rather than inferring signing from compiler
optimization. Native regression checks cover development, production, absent,
missing-entitlement, unknown, and malformed profiles, plus the actual signed
development build's profile. An unreadable profile blocks registration with a
diagnostic instead of guessing. The corrected build was installed and launched
on the same phone.

## Automated verification

- Collection: `npm run lint`, `npm run format:check`, `npm run ts:check` — pass.
- Collection: `npm run test:unit` — 33 tests in 10 suites pass.
- Server: `vitest run test/liveActivities.unit.test.ts` — 11 tests pass. These
  exercise mocked backend behavior, not deployed APNs delivery.
- Native: the Swift checks documented in `live-activities.md`, including the
  actual device build's profile — pass.
- Signed Release `xcodebuild` for the connected iPhone — build succeeded.
- Repository: `./scripts/check-structure.sh` and `git diff --check` — pass.

## Blocked / not verified end to end

`GET https://api.lovat.app/collection/live-activities/test` returns HTTP 404 with
`{"code":"NOT_FOUND","message":"Route not found","displayError":"Route not found"}`.
Collection also displays “Unable to refresh Live Activity assignments.” The
feature branch defines that route; an unauthenticated request should reach its
input validation rather than a missing-route response.

Consequently, automatic startup from real assignments, APNs token registration,
locked/background pushes, completed-match advancement, assignment edits,
schedule completion, and remote suppression after disabling are **not passed**.
Deploy the matching Server routes/worker and verify APNs credentials before
repeating these checks with isolated test assignments. No synthetic reports or
assignment changes were written to production during this test.

The Home Screen widgets remain static sample demos; real widget assignment
updates are not implemented. The small native Home Screen widget, before-shift
Lock Screen appearance, and iPhone Settings-level denial were not separately
tested. Simulator results are not substitutes for any missing device or
push-delivery checks. The phone was left with Live Activities enabled in real
assignment mode and no activity active because the server route is unavailable.
