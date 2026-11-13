# Dashboard manual release checks

Related: LVT-265, LVT-266, LVT-344. These checks are **prepared, not executed**.
Leo Kansal (Dashboard issue assignee) owns the acceptance record; the release
operator records their name and may perform the checks with a second reviewer.
Do not publish a mobile candidate until every applicable row passes. A blocked
or unexecuted row is pending, never a pass. Track promotion/rollback changes
separately in LVT-345.

## Candidate and evidence

Copy this record into LVT-266 for each release. Use only a disposable sandbox
account/team and fictional scouting data. Install the exact signed APK/IPA to be
released through the normal distribution channel, not the integration harness.
Never attach tokens, credentials, raw account storage or private strategy data.

- Operator / reviewer / UTC date: **pending**
- Source commit SHA / build workflow run URL: **pending**
- App version + build number / artifact download URL: **pending**
- SHA-256 of downloaded APK/IPA (`shasum -a 256 <file>`): **pending**
- Device model / OS / prior installed version: **pending**
- Sandbox API origin / Auth0 application name (no secrets): **pending**
- Android native run / iOS native run / Chrome run URLs: **pending**
- Release decision and unresolved Linear issues: **pending**

The synthetic native workflow tests a debug integration entrypoint with injected
tokens. Its source/version and Android test-binary hash are retained, but it does
not prove signed-release installation, real Auth0 or physical camera behavior.
Use disposable simulators: the integration target clears its own app preferences.

## Sandbox Auth0 smoke (LVT-265)

Run in production `main.dart` on Android, iOS and the deployed candidate browser.
The release owner obtains sandbox credentials privately. Do not replace Auth0
with a fake token or change a production Auth0 tenant for this check.

| Check | Expected result | Outcome / evidence |
| --- | --- | --- |
| Clean install/private browser, choose sandbox server and sign in | Real Auth0 page opens; callback returns to the same app/origin; correct sandbox account appears | Pending |
| Cancel login and retry | Returns safely; no authenticated data until successful login | Pending |
| Background browser during login, then complete callback | App resumes once with the correct account, without a stuck spinner or duplicate navigation | Pending |
| Select tournament, inspect analysis, reorder a synthetic picklist and reopen it | Chosen tournament and saved order survive reload | Pending |
| Logout, restart, then login as a second sandbox source team | Old credentials/private notes and cached analysis do not appear for the second source | Pending |
| Expired session or revoked sandbox access, then retry | Visible recovery/login path; no unauthorized or stale private data | Pending |

Record Auth0 pass/fail separately for all three platforms; a Chrome synthetic
journey does not satisfy these rows.

## Physical Android and iOS acceptance (LVT-266)

| Check | Expected result | Outcome / evidence |
| --- | --- | --- |
| Install signed candidate and upgrade from previous release | Expected version/build launches; existing settings and saved work remain readable | Pending |
| Camera permission denied, retry, then grant in system settings | Denial is recoverable; scanner works after grant without reinstalling | Pending |
| Scan synthetic Collection QR, including multiple chunks and an interrupted/repeated scan | One complete report is accepted; partial/duplicate chunks do not corrupt data | Pending |
| Invalid/unrelated QR | Visible error; current saved work remains intact | Pending |
| Background, terminate and relaunch after selecting event/picklist | Expected selection and saved order persist | Pending |
| Airplane mode during analysis/save, then reconnect | Offline/error state is visible; recovery does not lose edits or show another team's data | Pending |
| Change account/server, then revisit cached views | Previous account/server private data is cleared or correctly isolated | Pending |
| Narrow screen, keyboard, rotation/back navigation | Controls remain reachable; navigation and permission prompts recover | Pending |

For failures, record the failing row, platform, exact candidate hash and a Linear
issue. Use redacted synthetic screenshots. If CI emulators are unavailable,
record that failure and perform the same journey on a disposable physical device;
attach its separate evidence rather than relabeling the failed CI run as passed.
