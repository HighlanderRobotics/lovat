# Worker batch rollout and sleep verification

## Implemented behavior

LVT-382 adds finite batch execution, durable maintenance, structured job logs and
an opt-in Railway Cron configuration. No schema migration is required. The production IaC graph defaults to six-hour
scheduled mode; applying the reviewed graph activates Cron. Merging alone does
not apply infrastructure or enable database sleeping. API-owned
TBA imports and periodic maintenance are removed; deploy the worker first and
verify its maintenance job before deploying the API.

## Operating schedule

Use the existing `.railway/railway.ts` named partial and authenticated CLI linked
to the intended environment. `RAILWAY_WORKER_CRON` is a **local IaC input** which
sets Worker `WORKER_MODE=batch`, Cron, and restart policy NEVER, and removes the
continuous health check. Production defaults to six-hour scheduled mode. Set `RAILWAY_WORKER_CRON` to an
explicit empty string to restore continuous mode. Other environments retain
continuous mode unless a Cron input is supplied. Confirm that the
plan clears the old health check/Cron/restart settings before applying. Never run
both a second polling worker and the Cron worker when trying to measure sleep.

| Phase | IaC input / operation | Match cadence when running |
| --- | --- | --- |
| Offseason | `RAILWAY_WORKER_CRON='0 18 * * *'` | Daily due-work window |
| Within seven days before an event | `RAILWAY_WORKER_CRON='0 */6 * * *'` | Four batches/day |
| Competition dates | Unset Cron input; apply continuous graph before local 07:00 | One minute 07:00–21:00 local; 15 minutes overnight |
| First seven days after event | Four batches/day, then return to daily | Six hours |
| Archived | Explicit backfill/enqueue only | Finalize after success |

18:00 UTC is provisional, not a measured optimal start time. Choose the actual
window using demand logs and deploy constraints. Global weekly team imports and
daily season/district/maintenance work share each batch; shorter queue intervals
never wake a stopped process. Failures wait until the next external window once
their retry delay has elapsed. If urgent, trigger a manual batch after that delay.

For automatic competition transitions, apply both
`RAILWAY_WORKER_CRON='0 */6 * * *'` and `RAILWAY_WORKER_MODE=scheduled`.
Each scheduled execution checks event-local calendar dates. Outside competition
it drains one finite batch; during competition it retains the continuous planner
and minute-level consumers until all current event dates finish, then drains and
exits. Six-hour starts occur before local 07:00 for every timezone. The planner
rechecks calendar state every 30 seconds. Railway skips overlapping scheduled
starts while this execution is active. A batch that discovers an already-active
event immediately enters continuous mode. Database failure during initial calendar
inspection fails the process rather than guessing the operating mode.

This scheduled mode needs no Railway API credential in the worker. Keep the
six-hour schedule throughout upcoming/recent event windows; daily batch mode is
only appropriate when the calendar has no nearby events. IaC rejects daily Cron
with scheduled event mode. Bootstrap catalogs before accepting competition traffic.

Railway requires Cron processes to close connections and exit; running jobs can
cause later scheduled starts to be skipped. See the [Cron documentation](https://docs.railway.com/cron-jobs).

## Remaining wake sources

- API requests that use Prisma, including authentication and queue writes.
- API `/status` currently responds without querying the database. It is not a
  readiness proof. Coordinate any probe changes with LVT-339.
- Continuous Worker `/health` queries `SELECT 1`; its planner and consumers poll
  every 30/5 seconds. Batch mode exposes no listener.
- Active training WebSocket sessions poll the database; idle API startup also
  ensures the built-in training exercise. Audit session lifetimes and restart
  frequency before interpreting sleep results.
- Each process's shared PrismaPg pool currently allows ten connections with a
  five-minute idle timeout. Batch disconnect closes its pool; API pools remain.
  Pool tuning belongs to LVT-376. Do not infer sleeping from a lack of API events.
- Release migrations, manual SQL, dashboards, previews pointed at the same DB,
  third-party uptime checks, public DB connections and database monitoring may
  keep the database awake. Verify actual platform network and sleep behavior.

## Preview verification and production gate

1. Verify an isolated preview Postgres/Redis and sandbox provider keys. Apply the
   existing schema via the API/release migration owner. Back up operational config.
2. Deploy worker code in continuous mode; verify maintenance and current-year
   imports. Deploy the API; start it with unavailable TBA and confirm serving and
   report lifecycle tests pass without API ingestion. During a rolling upgrade,
   old API replicas can retain timers: drain them before measuring ownership.
3. Apply the Cron graph in the preview. Verify exit code zero, `batch.disconnected`,
   no persistent worker connections, and no worker readiness probes between runs.
   Trigger an overlapping batch to verify leases, interrupt a batch and verify
   reclaim after 90 seconds, and simulate provider failure/429 with retry delay.
4. After auditing the wake sources, enable PostgreSQL Serverless in the preview.
   Observe a whole quiet interval and its next batch/request. Record **actual**
   platform sleep/resume transitions, connection counts and memory, plus p50/p95
   cold first-query/API latency, errors, and a warm-request comparison. Ensure
   readiness behavior and connection timeouts still allow correct responses.
5. Compare equal baseline/post-change windows: awake hours, sleep hours, memory
   GiB-hours, platform cost and traffic/event volume. Reconcile these against
   provider billing. Production response gaps (including the reported 7.6-hour
   maximum) do not measure Railway sleep and are not cost savings evidence.
6. Only after preview evidence and scheduled event cutovers, apply the reviewed
   production graph, retain one worker, and monitor overdue work and API latency.
   Do not enable database sleeping as an incidental consequence of merging code.

## Observability and rollback

JSON `job.started`, `job.completed`, `job.failed` include kind, target, attempt,
queue delay and duration. Completion includes next run or finalization; failure
includes sanitized error and retry delay. `batch.completed` includes eligible and
processed counts, interruption and duration. `batch.disconnected` records when
Prisma disconnect finished, not the server's measured last query or sleep time.
Use DB/platform metrics for actual activity, sleep, connection and cost evidence.
Alert on missing scheduled completion, repeated retries, overdue jobs and active
matches older than their event cadence. Logs contain no scouting payloads.

Rollback scheduling by setting `RAILWAY_WORKER_CRON=''`, reviewing/applying the
continuous graph and verifying `/health` plus fresh matches. Disable database
sleep if cold-start correctness regresses. Keep the new API import ownership;
restoring old API timers alongside Worker duplicates ingestion. Queue explicit
historical jobs to restore needed archived refreshes. Durable jobs and leases
survive restarts; successful finalized imports remain in their data tables.

## Evidence recorded for this change

Local fixture-backed PostgreSQL tests cover leases, retries, atomic ingestion,
archival finalization and fresh leases against an older snapshot. Batch tests
cover bounded consumers, stopping claims on abort, draining before disconnect
and disconnect on planner/claim failure. Deployment graph tests cover Cron and
continuous configurations.

As of 2026-11-19, the Railway plugin connection lists only `crux`; the local
CLI independently has Lovat access and PR #132 provisions a preview automatically.
No sleep or Cron settings were applied by this change. Actual sleep windows,
billing impact, cold-start measurements, demand-selected timing and scheduled
production cutovers remain unverified; LVT-382 must remain open until those
operational gates are met.


## Rollout audit — 2026-11-19

Production Postgres already has `sleepApplication=true`; current Worker has no
Cron and runs continuously. There were no pre-existing staged production changes.
Postgres baseline (24 hours, 1,441 samples): average 1.3616 GB, current 1.7921 GB,
maximum 2.0669 GB. Baseline successful HTTP responses in a 501-request sample
(2026-11-18 20:01 through 2026-11-19 16:07 UTC): median 122 ms, p95 391 ms.
These are warm/mixed observations, not cold-start measurements or savings.

The production calendar contains `2026mmr` on November 21 in America/Chicago;
use six-hour scheduled mode, not daily-only batches. Maintenance completed in
production at 16:20 UTC after a retry. Existing queue errors: 28 presentation,
five match, and one global-team job; durable retries must be preserved through
cutover. Postgres has WAL archiving enabled, archive timeout 60 seconds,
checkpoint timeout 300 seconds, and TCP keepalive idle 7,200 seconds. Audit WAL
archive traffic as a possible remaining wake source during the sleep trial.

Verification environment: `lvt-382-verification`
(`a0886b55-635a-488f-aad1-2074b73111c0`), with fresh credentials and a dedicated
500 MB volume. It contains no production data, backup credentials or archives.
Railway required dashboard two-factor verification to apply its initial services.
Do not expose its database through a public TCP proxy; run the checks from the
private service network. Actual sleep/cold-start evidence and production Cron
activation are still pending this verification.
