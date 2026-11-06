# Collection reports in progress

Storage contract for the Collection match lifecycle and paired training flow. The router is mounted at `/collection`, with `/v2/collection` retained as an alias. Existing v1 routes retain their contracts. Pairing, playback coordination, submission, and initial grading are implemented; resuming an unfinished report after an app restart remains future work.

## Implemented table

`ScoutReportInProgress` is defined in `packages/db/prisma/schema.prisma` with additive migrations. Keep unfinished payloads out of `ScoutReport` and analysis queries.

| Column              | Type                                         | Purpose                                                                                   |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| uuid                | String primary key                           | Client-generated UUID, retained for all retries and final submission                      |
| sourceTeamNumber    | Int foreign key                              | Owning registered team, resolved from validated team code                                 |
| scouterUuid         | String foreign key                           | Scout, verified to belong to the owning team                                              |
| deviceId            | String                                       | Originating device; metadata, not authorization                                           |
| seasonYear          | Int                                          | Selects the season-specific validator                                                     |
| schemaVersion       | Int                                          | Version of the saved report payload                                                       |
| mode                | COMPETITION or TRAINING                      | Immutable destination after creation                                                      |
| status              | LOADED, STARTED, ENDED, SUBMITTED, ABANDONED | Lifecycle state                                                                           |
| tournamentKey       | String                                       | Match identity snapshot; training may use exercise identity without a real tournament row |
| matchType           | MatchType                                    | Qualification or elimination                                                              |
| matchNumber         | Int                                          | Match identity                                                                            |
| teamNumber          | Int                                          | Robot being scouted, distinct from the source team                                        |
| trainingSessionUuid | String nullable                              | Required for training, absent for competition                                             |
| trainingAttemptUuid | String nullable unique                       | Binds one draft to a training attempt                                                     |
| payload             | Json                                         | Latest versioned report snapshot, including timeline events                               |
| revision            | Int default 0                                | Optimistic concurrency guard for updates                                                  |
| loadedAt            | DateTime                                     | First server receipt                                                                      |
| startedAt           | DateTime nullable                            | Client-observed match start                                                               |
| endedAt             | DateTime nullable                            | Client-observed match end                                                                 |
| submittedAt         | DateTime nullable                            | Successful server finalization                                                            |
| updatedAt           | DateTime                                     | Latest server update                                                                      |
| expiresAt           | DateTime                                     | Proposed draft retention deadline                                                         |
| finalizedReportUuid | String nullable unique foreign key           | Completed report for either competition or training                                       |

Add reverse relations to `RegisteredTeam`, `Scouter`, and `ScoutReport`. `TrainingSession` and `TrainingAttempt` provide session expiry, hashed pairing tokens, scout bindings, and submitted training payloads. Composite foreign keys ensure draft, attempt, and session identities agree. Drafts and attempts cascade with their owning scout/team/session so existing v1 deletion flows remain valid. Deleting a completed report clears the draft link while retaining the submission receipt. Do not introduce a uniqueness constraint on scout and match: repeated practice attempts must remain possible with new UUIDs.

Indexes: `(sourceTeamNumber, scouterUuid, status, updatedAt)`, `(sourceTeamNumber, tournamentKey, matchType, matchNumber)`, and `(status, expiresAt)`. Database constraints must enforce training/competition binding rules and allow `finalizedReportUuid` only for submitted drafts. Lifecycle handlers enforce timestamp ordering and immutable match/owner identity.

## Training videos and report relationships

`ScoutReport.training` defaults to false, including existing reports. `trainingSessionUuid` is nullable; a database check requires `training = true` when a session is attached. Answer-key reports can be marked training without belonging to a scout's session.

`TrainingVideo` stores `uuid`, `matchKey`, `videoLink`, and creation/update timestamps. Its match foreign key references the canonical `Match` table. The `answerKeyReports` relation supports multiple correct reports per video and reuse of a correct report across videos.

`TrainingSession.trainingVideoUuid` is optional until the scout selects a video. Sessions expose `completedReports`, `reportsInProgress`, and `attempts`. Completed training reports can be linked from a submitted draft through `finalizedReportUuid`; training drafts retain their session and attempt bindings. Deleting a session clears the completed report's session link while preserving its training flag. Deleting a video clears session video selection.

Training ingestion creates completed reports with `training = true`, associate them with the session, and validate that their match and owning team agree with the exercise. Competition analysis, exports, match progress, and scout completion counts filter out training reports. Loading, start, end, submission, pairing, and the initial grading rubric are implemented.

## Training scores

`TrainingScore` stores each grading run separately: submitted report, answer-key report, rubric version, decimal overall score from 0 to 100, JSON category/error breakdown, and grading timestamp. The submitted report provides the session and scout/team relationships; these identifiers are not duplicated on the score.

Required `answerKeySnapshot` and `submittedReportSnapshot` JSON objects preserve the inputs used by the grading run. Snapshot creation must include the reports' timeline events. Editing a live report does not change a saved snapshot. Multiple scores per report preserve regrading history. Deleting an answer-key report clears its optional foreign key and retains the snapshots; deleting the submitted report removes its scores along with it. Grading verifies the submitted report is training data and uses a stable rubric version. Training submission triggers grading, and the host can retry pending grades from summaries.

## Pre-match loading

POST `/collection/load/:match/:team` accepts the canonical match key and robot number in the URL. Required headers are `X-Team-Code`, `X-Device-Id`, and `X-Scouter-UUID`. The body requires a client-generated report `uuid`; optional `trainingAttemptUuid` binds it to an existing owned training attempt. Collection creates this UUID locally and reuses it for every request about the report, including offline retries.

The handler verifies scout/team ownership and match participation, derives the report identity from the robot's match slot, and derives season from tournament metadata (or the legacy tournament key). It stores an initial payload with an empty event list, revision zero, and seven-day expiry. Training requires an owned, unexpired attempt whose selected video matches the requested match; answer-key robot checks belong to grading. Mode is derived from that verified binding.

Creation returns 201; an identical retry returns the existing draft with 200, without resetting its progress or expiry. Identity fields are compared directly; request hashes and transaction retry loops are not used. Simultaneous duplicate creations return 409 and can be retried with the same UUID. Replies contain `{ uuid }`. Malformed input returns 400, invalid team code 401, missing or unowned resources 404, conflicting identity or attempt 409, expired drafts/sessions 410, and unexpected persistence failures 500.

## Implemented endpoint contract

All routes use the client report UUID. Start, end, and submit require `X-Team-Code` and `X-Scouter-UUID` and only access the caller's own draft. Timestamps are integer milliseconds since Unix epoch; timeline event times remain seconds relative to match start.

| Endpoint                             | Request body                                                                                               | Behavior                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| POST `/collection/load/:match/:team` | `{ uuid, trainingAttemptUuid? }`                                                                           | Validate match/robot and create LOADED draft; also requires `X-Device-Id`.                     |
| POST `/collection/start`             | `{ uuid, startTime }`                                                                                      | LOADED → STARTED; save the client start time.                                                  |
| POST `/collection/end`               | `{ uuid, endTime }`                                                                                        | STARTED → ENDED; require end time at or after start.                                           |
| POST `/collection/submit`            | The complete Collection report, including `uuid`, `scouterUuid`, `startTime`, match identity, and `events` | ENDED → SUBMITTED; validate identity and timeline, then save the report and events atomically. |

Replies contain `{ uuid }`. Start/end retries with the original timestamp succeed after later transitions. A submission retry succeeds when its parsed payload matches the stored payload; a changed timestamp, identity, or submitted payload returns 409. Concurrent state changes return 409; retry with the same UUID. No request hashes, client revision protocol, or transaction retry loops are used.

Return 400 for malformed requests/timelines, 401 for an invalid team code, 404 for missing or unowned resources, 409 for conflicts or invalid states, and 410 for expired drafts/sessions. Existing submitted reports can be retried after expiry without writing them again. Start and end renew the seven-day draft expiry. Pairing is implemented; report resume remains future work.

## Submission and recovery

Finalize competition drafts in one database transaction: validate, create `ScoutReport` and events, record the submitted payload and report link, and mark the draft SUBMITTED. Concurrent or repeated submissions must create only one completed report. Emit notifications after commit; durable jobs should handle retryable external effects.

Training submission creates a `ScoutReport` with `training = true` and its session binding, links the submitted draft to that report, and updates the training attempt. The training submission endpoint grades the saved report; the host can retry pending grades. It never calls the competition ingestion handler or changes scout reliability. The training session must be valid for draft creation and submission. An expired session on upload returns an explicit recovery error and never reroutes to competition.

Collection retains reports locally and queues lifecycle requests in order. Preserve UUID, payload version, revision, and training destination with the report across restarts. A network failure must not block local scouting. This contract initially synchronizes snapshots at lifecycle boundaries; continuous event sync is deferred. A future owner-scoped GET `/reports-in-progress/:uuid` will let clients reconcile server revisions and lost responses. Collection integrates lifecycle requests and paired training.

Retention: reject drafts after seven days of inactivity, mark them abandoned during the twelve-hour cleanup job, and scrub their payloads after thirty days. Retain submitted reports and draft identifiers under the report retention policy so delayed retries remain idempotent.

## Implementation checks

Verify ownership rejection, out-of-order transitions, identical and conflicting retries, stale revisions, concurrent finalization, and transaction rollback. Verify offline replay and expired training submissions cannot reach competition storage. Run v1 report contract tests alongside Collection lifecycle tests. Planned initial payload: season 2026, schema version 1. UUIDs are client-generated; `/start`, `/end`, and report `startTime` use epoch milliseconds. The table retains a reserved transition-receipt field; these handlers compare saved timestamps and payloads directly. Training session creation, video playback, WebSocket snapshots, and initial grading are implemented.

## Local development database

The migration was validated on a disposable PostgreSQL cluster at `/private/tmp/lovat-lifecycle-pg`, port 55439, database `lovat_test`. Use `DATABASE_URL=postgresql://jackshim@127.0.0.1:55439/lovat_test` for local server/database commands; the configured Railway URL was not changed or migrated. Migration status can be checked with `npm run db:status` in `packages/db` and this local database URL.

## Collection routes and offline uploads

The canonical prefix is `/collection`. `/v2/collection` remains an alias, and all existing `/v1/manager` routes remain available. Collection handlers live in `apps/server/src/handler/collection`; the v1 routers import those same handlers.

| Method and path                         | Purpose                                        | Existing v1 route                          |
| --------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| GET `/collection/checkcode?code=…`      | Check team code                                | `/v1/manager/scouter/checkcode`            |
| POST `/collection/scouter`              | Add scout                                      | `/v1/manager/scouter`                      |
| GET `/collection/scouter`               | List team scouts                               | `/v1/manager/scouters`                     |
| GET `/collection/tournament`            | List tournaments                               | `/v1/manager/scouters/:uuid/tournaments`   |
| GET `/collection/schedules/:tournament` | Scout schedule                                 | `/v1/manager/scouterschedules/:tournament` |
| POST `/collection/scoutreports`         | Upload reports saved before lifecycle tracking | `/v1/manager/scoutreports`                 |

POST `/collection/load` also accepts `{ uuid, teamNumber, matchIdentity: { tournamentKey, matchType, matchNumber }, trainingAttemptUuid? }`. Match type is `QUALIFICATION` or `ELIMINATION`; the number is the existing Collection ordinal. The server resolves the canonical match through its imported team slot. `/collection/load/:match/:team` remains available for callers that already know the canonical match key.

Collection sends lifecycle requests when selecting, starting, and ending a match. A restart generates a fresh report UUID. Network failures do not block recording. Before uploading, the app saves the completed report and lifecycle metadata in history, then replays load/start/end/submit with the original UUID and timestamps. History retries use the saved scout identity, and require the original source team to be selected. Team codes are not copied into report history. Existing history entries without lifecycle metadata retain the legacy upload contract through `/collection/scoutreports`. QR payloads are unchanged. Local-only practice mode continues to disable submission; paired training permits submission to its bound session.

Client request tests run from `apps/collection` with `node --experimental-strip-types --test test/*.test.mjs` on Node 24.

## Paired website training

The website flow at `/training/start/` now uses Magnolia controls and the shared Lovat dark palette: start, select a match key, show the QR and scout/device roster, start the session, play the match, and complete to live summaries. Every participant scouts the video's single answer-key robot. The first joining scout binds the session to their source team. Videos without exactly one training answer key are not listed.

Sessions have LOBBY, ARMED, PLAYING, ENDED, and INTERRUPTED states. Browser and device access tokens are generated independently and stored as hashes. WebSockets authenticate in their first message, not in query strings. Browser snapshots show the roster; device snapshots contain only their own attempt. Session state is stored in PostgreSQL and read by each WebSocket connection, so reconnects and separate API instances observe the same state. Socket heartbeats expire disconnected participants. A session lasts six hours; loading and submission retain the existing ownership and expiry checks.

New API routes live below `/collection`: GET `/training/videos`, POST `/training/sessions`, POST `/train/:session` (QR join with normal Collection identity headers), GET `/training/sessions/:session`, POST `.../ready`, POST `.../control`, DELETE `.../participants/:attempt`, POST `.../grade`, and POST `/training/:session/submit`. Browser actions require its bearer token; readiness and device snapshots require the specific attempt token. Showing the paused preview requires connected participants; it does not require a starting pose. Playing requires every participant to have loaded the target robot, selected a starting pose, and marked ready. Authenticated device HTTP snapshots refresh that attempt's heartbeat when WebSockets are unavailable. The `/collection/training/socket` WebSocket is attached by the Server entrypoint.

YouTube playback begins at the configured offset. Collection automatically starts its report clock when playback starts and ends after the configured match duration (163 seconds), including after reconnect. Video playback continues for 15 more seconds, independently of the report clock. A pause, seek, or prolonged buffer interrupts the session and requires a new one. Complete opens summaries without preventing late uploads. Training submission uses a separate URL, and training reports do not expose competition QR exports. History keeps the training destination for offline retries; the current local-only practice toggle remains separate. Training pairing credentials are kept in memory in Collection; restarting the app mid-attempt requires joining a new session. Completed reports remain persisted in History.

The initial `training-v1` rubric gives 50% to scoring/feeding quantities, 30% to one-to-one event matches within two seconds, and 20% to objective post-match fields. Notes, subjective driver ratings, and unspecified fields are not graded. Automatic grading is idempotent under a report row lock; a failed grade can be retried from the summary page. Scores retain immutable report/event snapshots.

Website configuration uses private runtime `LOVAT_API_BASE` for its HTTP proxy and `LOVAT_PUBLIC_API_BASE` for the browser-reachable WebSocket origin. The public URL contains no credentials. Collection uses its existing configured API URL; a physical device needs a reachable development server, rather than the computer's loopback address.

Local preview setup after migrations:

```sh
# apps/server, Node 22; disposable database only
DATABASE_URL=postgresql://jackshim@127.0.0.1:55439/lovat_test npx tsx tools/seed-training-exercise.ts
DATABASE_URL=postgresql://jackshim@127.0.0.1:55439/lovat_test npx tsx tools/preview-training.ts

# apps/website, Node 20
LOVAT_API_BASE=http://127.0.0.1:3002 LOVAT_PUBLIC_API_BASE=http://127.0.0.1:3002 npm run dev -- --host 127.0.0.1 --port 5174
```

The fixture CLI remains restricted to local `lovat_test` and invokes the same idempotent built-in exercise installer as Server startup. The Johnson Qualification 19 video starts at seven seconds and uses the transcribed robot 118 answer key. Server startup makes this reviewed exercise available after migrations without a manual Railway database edit.
