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

## Isolated test-server follow-up

The real Server application was subsequently run on the Mac at port 43189 with
a new PostgreSQL cluster on loopback port 55439, database `live_activity_qa`, and
Redis on loopback port 56389 with a dedicated key prefix. The phone used its
existing scout selection against locally seeded synthetic data. No production
database, scouting report, or assignment was modified.

- The phone fetched assignments through the real authenticated API and started
  an activity automatically in Real scout assignments mode.
- Redis received both the phone's push-to-start and activity-update tokens,
  registered as sandbox. Tokens were not printed or committed.
- The actual expanded Island showed Now Q27 / Next Shift Q28. After completing
  Q27 in the test database, leaving Collection in the foreground for over a
  minute, and returning Home, the expanded Island showed on-shift Q28/team 8433
  without pressing Refresh.
- After changing Q28's assigned team, the phone's Debug state showed team 254.
- Subsequent explicit foreground refreshes showed P1/team 8433 and F1/team 8033
  from the real API. Completing the final assignment removed the activity and
  Debug reported no active activity.
- Real HTTP/PostgreSQL smoke checks passed for missing/invalid credentials,
  unknown scouts, waiting/on-shift states, reassignment, canceled matches,
  Q/P/F advancement, and null state after completion. The fixture refuses
  hosted URLs and other database ports/names; those refusal checks passed.
- Full Server verification passed: build, typecheck, test typecheck, and 1,481
  tests in 75 suites. Lint exited successfully with 79 existing warnings and no
  errors. An initial test run without DATABASE_URL could not load DB-dependent
  suites; a run inheriting dev-server configuration mismatched CORS/prefix
  expectations. The successful run supplied only the isolated DATABASE_URL and
  used the tests' normal environment defaults.

The isolated server reports `backgroundReady: false`: no APNs provider key was
available. Locked/background delivery, APNs heartbeats, and push-to-start delivery
remain unverified. Token registration and foreground lifecycle checks do not
replace those tests. Setup and repeatable fixture/smoke commands are documented
in Server's `docs/live-activity-test-server.md`.

After testing, Collection's custom API URL was reset through Settings; the
custom-URL card disappeared, confirming the normal production default was
restored. The isolated server was left running on the Mac with the fixture reset
to before shift for repeat testing. It is reachable only while this Mac and its
local services remain running; it is not a hosted deployment.

## APNs-enabled follow-up

The supplied APNs provider key was configured only in the private local test
environment, outside Git. Apple accepted sandbox pushes for the installed
development-signed app. No private key, JWT, or device token was printed or
committed. These results apply to the local QA server and sandbox signing, not
the currently deployed production API or a distribution build.

- Apple's Lock Screen permission prompt was accepted by the phone owner.
- With Collection in the background, an APNs update changed the Lock Screen
  from before shift to Q28/team 254. The scheduled Server worker then advanced
  the display to Q29/team 8033 after Q28 was canceled. No foreground assignment
  fetch was used for those changes.
- An unchanged three-minute heartbeat was accepted and the Lock Screen remained
  fresh after the prior update's five-minute stale deadline, without reopening
  Collection.
- For push-to-start, the phone first registered with an empty test schedule:
  Debug showed no active activity and Redis held only a start token. Collection
  was put in the background and the phone locked. Seeding pending assignments
  caused a new activity to appear on the Lock Screen; a new activity identifier
  and update token arrived at Server without another foreground fetch.
- The remotely started activity then received its next Q28/team 8433 update
  while the phone remained locked. Completing all remaining synthetic matches
  sent a remote ending: the Lock Screen card disappeared before reopening
  Collection, and the isolated Redis device registration count became zero.

Initial low-priority updates were accepted by APNs but did not promptly change
the visible state. An immediate-priority probe delivered the new assignment.
Server now uses priority 10 for changed content, starts, and endings, while
unchanged heartbeats stay at priority 5. Existing delivery/token-rotation checks
were retained and two priority regression tests added: all 1,483 Server tests in
75 suites pass, along with build, test typecheck, and lint (the same 79 warnings,
zero errors). Apple still controls delivery timing and budgets.

The APNs session finished with no active test activity or device registration.
The phone remained locked, so resetting its custom API URL back to production
is pending the owner's unlock. The APNs key is configured only on the local
test server; production deployment and distribution-environment verification
remain separate work.
