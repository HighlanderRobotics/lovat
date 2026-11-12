# Collection manual release checks

Related: LVT-217 and LVT-262. Status: **prepared; device acceptance pending**.
Jack Shim (Collection issue assignee) owns the acceptance record. Name the release
operator and reviewer for each candidate. Run on a disposable Android device and
an iOS 27 device with a sandbox team; use only fictional scouting information.
An unexecuted/blocked check is pending and prevents mobile release approval.

## Evidence record

Copy into LVT-262 for each candidate:

- Operator / reviewer / UTC date: **pending**
- Source SHA / build workflow or EAS run URL: **pending**
- Version / Android versionCode or iOS buildNumber: **pending**
- Signed candidate artifact URL / SHA-256 (`shasum -a 256 <file>`): **pending**
- Device model / OS / previous installed version: **pending**
- Sandbox API origin / synthetic team code (no credentials): **pending**
- Native Android run URL / iOS simulator evidence: **pending**
- Each row's result, redacted evidence and linked defect: **pending**
- Release decision / owner sign-off: **pending**

The CI APK is a test-only x86_64 standalone release-mode build with generated
loopback network access. It uses the template's test signing and is not a store
candidate. Its hash and source revision are retained with test results. Testing
that APK does not certify the signed mobile artifact distributed to users.

## Device acceptance matrix

Record pass/fail separately for Android and iOS; do not combine them into one
unchecked statement.

| Check                                                                                               | Expected result                                                                             | Android / iOS evidence |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| Clean install from normal signed distribution channel                                               | Correct version/build launches and onboarding works; iOS 27 does not crash on launch        | Pending / Pending      |
| Upgrade from previous supported version with one saved old report                                   | Settings and report remain readable; migration preserves report identity and data           | Pending / Pending      |
| Set sandbox API with `lovat-collection://set-url?u=<encoded-sandbox-origin>`; enroll synthetic team | Correct sandbox origin/team/scouter/event are shown                                         | Pending / Pending      |
| Record a complete report while airplane mode is enabled                                             | Save succeeds locally; upload failure is visible and recoverable                            | Pending / Pending      |
| Background, force-terminate and relaunch without clearing app storage                               | Saved report remains in History with the same UUID and event data                           | Pending / Pending      |
| Reconnect and retry from History, then reopen/retry again                                           | Exactly one successful server report; UUID is unchanged; no duplicate successful submission | Pending / Pending      |
| Open Settings, change event/scouter/server, then relaunch                                           | Expected selections persist and saved reports stay associated with their original data      | Pending / Pending      |
| Display a multi-part synthetic report QR and scan with Dashboard on a second physical device        | Dashboard reconstructs one identical report; partial/repeated chunks recover safely         | Pending / Pending      |
| Dashboard scanner camera denied, retried, then granted via system settings                          | Permission denial is recoverable and transfer succeeds after grant                          | Pending / Pending      |
| Scan unrelated/invalid QR with Dashboard                                                            | Clear error; existing report data is preserved                                              | Pending / Pending      |
| Phone lock/background during QR display, then reopen                                                | QR remains readable and represents the same saved report                                    | Pending / Pending      |

Collection displays QR codes; camera permission belongs to the receiving
Dashboard scanner. Do not invent a Collection camera-permission pass. Record the
receiving Dashboard version/build and OS alongside each transfer result. Keep
Auth0 login checks in Dashboard's LVT-265/266 acceptance record.

## Automated candidate run and iOS handoff

Dispatch **Collection native candidate tests** at the exact candidate SHA with
both inputs empty to generate and test a fresh standalone Android APK. Or provide
both the build run ID and artifact name for an externally built standalone APK;
the workflow rejects a different source revision. Never provide only one input.
The Android runner verifies airplane/offline, real process restart, saved History,
reconnect/retry and one preserved UUID. Failures remain failures, with diagnostics.
Do not use a personal device: bootstrap intentionally clears app storage.

For iOS, build the existing `native-smoke-ios` EAS simulator profile with Xcode 27
from that same source SHA, record the run URL, version and artifact hash, install
on a disposable simulator, and run `.maestro/bootstrap.yaml`,
`.maestro/offline-restart.yaml` and `.maestro/reconnect.yaml` against the synthetic
fixture (`node test/native/fixture-api.mjs`). Stop the fixture before the offline
flow and restart it before reconnect; iOS simulators have no airplane-mode API.
Retain Maestro JUnit/screenshots and the fixture submission ledger. This iOS
procedure is a pending operator check until its actual build/run evidence is
attached; a build profile alone is not a passed native test. Physical-device
rows above still apply after a simulator pass.

If CI cannot boot/install, attach its failure and run the same journey on a
physical test device. Record that separate result explicitly. Attach redacted
synthetic screenshots only; never publish real notes, strategy or login tokens.
