# worker

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

Starting the worker queues and imports the current season into the configured
database. Set `DATABASE_URL` and `TBA_KEY` first. `WORKER_CONCURRENCY` defaults to
2 and supports 1–16 consumers. SIGINT/SIGTERM stops new claims, lets running
imports finish, and disconnects the database.

## Database client

Copy `.env.example` to `.env` and set `DATABASE_URL` for the intended database.
Import the shared client from `src/db.ts` (for example, `import { db } from
"../db"` in a job). Reuse it across jobs and call `await db.$disconnect()` during
worker shutdown. Importing it requires `DATABASE_URL` but does not connect until
the first query. `bun install` builds the shared database package through its
existing npm toolchain; this requires a supported Node.js version (22.20.0 or
24+). Schema and migrations remain owned by `packages/db`.

## TBA helper

Set `TBA_KEY` in `.env` and import the shared client in jobs:

```ts
import { tba } from "../tba";

const status = await tba.getStatus();
```

The shared client validates its key on import and makes requests only when a
method is called. Tests can use `createTbaClient()` with an injected fetcher.

`createTbaClient()` reads `TBA_KEY`. It provides `getStatus()`,
`getTeamsPage(page)`, `getTournaments(year)`, `getMatchEvent(eventKey)`,
`getMatches(eventKey)`, and `get(resourceKey, zodSchema, options)` for other
endpoints. Resource keys are relative to `/api/v3/`, without a leading slash.
Requests time out after 15 seconds by default; callers can also supply a signal.

Pass saved `etag` and `lastModified` values in the request options. A response
has `modified: true` and validated `data`, or `modified: false` for HTTP 304.
Persist returned validators with the imported records in one database
transaction. This helper does not write fetch state or retry failed requests;
the job runner owns retries and can inspect `TbaHttpError.status` and
`retryAfter`.

For all teams, enumerate pages 0 through `getStatus()`'s `max_team_page`.
Do not stop at an empty page. If the status request returns 304, use a stored
page bound or fetch status unconditionally; 304 has no response data.

Run `bun run test` and `bun run typecheck` to verify the helper.

## Team import

Call `importAllTeams()` from `src/jobs/teams.ts` to import the global team
catalog. Each page's team updates and cache headers commit together; retries
skip unchanged pages and resume pages that did not commit. This import writes
`Team` identities, not historical `TeamSeason` metadata.

The team integration tests require an already-migrated disposable local
`lovat_test` database. Set `DATABASE_URL` to that database and `LOVAT_DB_TEST=1`
when running `bun run test`. They replace TBA responses with fixtures and do
not call the live API. Without the flag, database tests are skipped.

## Tournament import

```ts
import { importTournaments } from "./src/jobs/tournaments";

await importTournaments(2026, 2026);
```

The year range is inclusive and defaults to 2023 through the current UTC year.
The full TBA event endpoint supplies metadata, season/district relations, and
parent-event links. Each year and its fetch validators commit together. Missing
parents fail the transaction rather than leaving incomplete links. Existing
match-fetch ETags and scouting relations are preserved. This function does not
import event rosters or matches. Its database tests use the same opt-in setup
as the team tests.

## Match import

```ts
import { importMatches } from "./src/jobs/matches";

await importMatches("2026casj");
```

Import the tournament first. This job fetches event metadata and full match
results, then saves matches, alliance scores and breakdowns, team slots, and
cache headers in one transaction. Missing teams receive placeholder names;
the global team import can fill them in later.

Event metadata supplies remapped participant identities. Match validators are
reused only when the event ETag is unchanged. Existing qualification and double
elimination slot keys are reused to preserve scouting links. Changes to a team
with existing reports, or removal of a slot with reports, fail the transaction
and require reconciliation. Unscouted removed slots are deleted; matches missing
from a later response are retained.

Practice matches are skipped because the current match enums do not support
them. The job does not populate event rosters; the scheduler runs roster imports
separately. Match
integration tests use the same disposable database setup as the other imports.

Server requests queue a `matches` job instead of importing TBA data themselves.
They return the currently stored data; newly requested imports complete
asynchronously while the worker is running. Existing jobs retain their lease,
refresh time, and retry delay. The worker owns participant reconciliation and
match cache validators, so an API request cannot bypass scouting-link checks.

Match display order follows a complete actual-time sequence when available,
otherwise a complete scheduled-time sequence. Before times are published,
traditional brackets alternate series by game number; double-elimination
brackets use numbered sets. Gap inference uses the same ordering, with stored
display order as a fallback when timing is incomplete.

## Season, district and roster imports

```ts
import { importTeamSeasons } from "./src/jobs/team-seasons";
import { importDistricts, importDistrictTeams } from "./src/jobs/districts";
import { importTournamentTeams } from "./src/jobs/tournament-teams";

await importTeamSeasons(2026);
await importDistricts(2026);
await importDistrictTeams("2026fim");
await importTournamentTeams("2026casj"); // Tournament must exist first.
```

Season team pages populate `TeamSeason` names and locations without replacing
the global team's name or district membership. These are snapshots of TBA's
returned metadata; filtering by year does not establish that every metadata
field is historically accurate. District imports include districts with no
events and reconcile memberships through `TeamSeason.districtSeasonKey`.
Roster imports populate `TeamTournament`, apply participant remappings, and
remove stale roster memberships without touching matches or scouting reports.
Each response commits with its cache headers; failed transactions retain the
previous validators. Match and roster imports separately track the metadata
version applied to their records.

The imports cover the current official-data tables, including alliance selections
and awards. Rankings, district points, Statbotics metrics, and practice matches
remain future work.

## Scheduler

`src/scheduler.ts` stores recurring work in `ImportJob`. The planner checks every
30 seconds and discovers current-season tournaments and districts. Tournament
and district catalog imports also queue child jobs for their imported year,
so manually queued historical years can be backfilled.

Match refresh intervals use event-local dates and hours:

| Event window                   | Match refresh | Roster refresh |
| ------------------------------ | ------------- | -------------- |
| Event dates, 07:00–21:00 local | 1 minute      | 1 hour         |
| Event dates, overnight         | 15 minutes    | 1 hour         |
| Starts within 7 days           | 30 minutes    | 6 hours        |
| Starts later, or dates unknown | 1 day         | 1 day          |
| Ended within 7 days            | 6 hours       | 1 day          |
| Older event                    | 7 days        | 7 days         |

Missing or invalid timezones fall back to UTC. Activity is inferred from dates,
not from a live event status feed. Due match jobs near the event's date window
receive priority over background imports. Global teams and season teams refresh
weekly, tournament catalogs every 6 hours, and districts/memberships daily.

Claims use PostgreSQL `FOR UPDATE SKIP LOCKED`, a 90-second lease renewed every
30 seconds, and token checks on completion. Expired leases can be reclaimed;
execution is at least once, so imports must remain idempotent. Failures retain
the job and retry with exponential backoff from 1 minute to 1 hour, honoring
longer TBA `Retry-After` values. The planner preserves these retry delays.

Queue a historical season or individual import while the worker is running:

```bash
bun run enqueue tournaments 2023
bun run enqueue districts 2023
bun run enqueue team-seasons 2023
bun run enqueue matches 2026casj
```

Enqueueing an existing job preserves its lease and scheduled time. Queue rows
hold pending/recurring work and the latest failure, rather than an execution
history. No new database migration is needed for this scheduler.

## Tournament gaps

`TournamentGap` stores inferred pauses between adjacent matches, with the
boundary match keys, start/end times, type, and timing source. Match imports
rebuild gaps in the same transaction as results and cache headers. HTTP 304
responses also rebuild them from stored matches so an existing database can
be backfilled. A tournament row lock serializes gap recalculation with match
imports; stale gaps are replaced rather than accumulated.

| Type                 | Inference                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `OVERNIGHT`          | Different event-local dates, separated by at least 4 hours; represents EOD followed by a new day.   |
| `DELAY`              | An actual pause where the scheduled pair had no qualifying gap.                                     |
| `PLAYOFF_TRANSITION` | At least 15 minutes from the last qualification match to the first playoff match.                   |
| `LUNCH`              | A same-day pause of 30 minutes to 3 hours around the local lunch window.                            |
| `BREAK`              | Another pause of at least 30 minutes, or insufficient local-time context for a more specific label. |

Thresholds measure the interval between match starts. Comparable actual times
take precedence over scheduled times, followed by predicted times. The worker
does not mix actual and planned timestamps across a pair, bridge missing
qualification numbers or matches with unknown times, or invent an open-ended
EOD after the final match. Without a valid event timezone, lunch and overnight
classifications remain unknown breaks.

All classifications are estimates, not official break announcements. The
inferred start uses result publication when it falls between the actual match
starts; otherwise it estimates 3 minutes after the preceding match starts.
The end is the following match's start. Stored matches retained after provider
removals also remain part of inference. Gaps do not suspend scheduler polling.

Backfill gaps without fetching the provider:

```ts
import { refreshTournamentGaps } from "./src/jobs/gaps";

await refreshTournamentGaps("2026casj");
```

Or queue `bun run enqueue gaps 2026casj` for the worker. Explicit gap jobs repeat
daily; normal match jobs already recalculate gaps on every refresh. Apply the
shared database migration and rebuild the database package before running the
updated worker.

## Railway deployment

Build from the repository root with `docker build -f apps/worker/Dockerfile .`.
The image pins Node 22.20.0 and Bun 1.3.14, builds the shared Prisma package
before installing the worker with its frozen lockfile, checks TypeScript, and
runs as the non-root `node` user. The Docker build context excludes local
environment files, generated clients, dependency directories, and other apps.

For the worker service, set Root Directory to `/` and Config File to
`/apps/worker/railway.json`. Configure these variables in the intended preview
environment:

```text
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
TBA_KEY=${{api.TBA_KEY}}
WORKER_CONCURRENCY=2
```

Service names in references must match that environment's services. Use the
preview database reference, not a production database URL. Railway supplies
`PORT`; local health checks default to 8080. The worker listens on `/health` and
returns 200 only after a successful scheduler pass within the last two minutes
and a working database query. Startup fails if the import/gap tables are absent.

The worker does not run migrations. Deploy the shared schema through the
existing API/release migration owner before starting it. It runs continuously,
with sleeping disabled and one replica by default. SIGTERM stops new claims and
drains current jobs; Railway allows 60 seconds before termination. If a long
import is interrupted, its lease expires and another process can retry it.

GitHub CI runs fixture-based database tests, typechecks, and a Docker build for
worker or shared database changes. Successful imports log their kind, target,
and next refresh time without credentials or scouting content.

## Tournament presentation data

`tournament-details` imports TBA alliance selections and awards, preserving pick
order, backups, and numeric participant remaps. It also imports raster avatars for
the roster's `TeamSeason` records. The scheduler refreshes details at the roster
cadence. Each event snapshot and its validators commit together; each team avatar
commits separately so a failed media request can resume without discarding event
data. A fresh empty response clears withdrawn data, while HTTP 304 preserves it.

### Historical seasons

Run `bun run backfill 1992 2025` with the target database and TBA credentials configured to queue archived season imports. With no arguments, it queues every season from 1992 through the current year. Existing jobs keep their leases and retry schedules. Tournament and district imports queue event and district details through the existing scheduler, so the backfill continues on the worker.

## Scoreboard OCR

Optional 2026 video processing and reversible scouting-lead review are documented
in [scoreboard-ocr.md](../../docs/scoreboard-ocr.md). It is disabled by default;
configure a reviewed broadcast layout before enabling it. No match images are
retained in the database, and flags do not automatically exclude scouting data.

### Private resource benchmark

`bun tools/benchmark-native-railway.ts` is an operator-only, one-shot task.
Use it only on PR #95's Worker with its existing private native/media access;
the runner refuses other environments and never opens SQL connections. Save the
original service configuration before temporarily replacing the start command
and disabling automatic restarts. Set a fresh `OCR_RESOURCE_RUN_ID`,
`OCR_RESOURCE_DECODER_THREADS` (1/2/4), and first set `OCR_RESOURCE_PREFLIGHT=1`
to read authenticated numeric counters without opening the media bucket.
The full run requires a verified two-CPU native quota, native concurrency two,
an idle processor, and the expected decoder setting.

After preflight, clear `OCR_RESOURCE_PREFLIGHT`, use a new run ID, and optionally
set `OCR_RESOURCE_REFERENCE_RUN` to a completed run to require identical evidence
across decoder settings. Numeric phase summaries are written to private logs;
full results stay in the existing private media store. Restore the original
configuration, tuning values and normal Worker command when finished or if the
experiment fails. Keep automatic restarts disabled during the experiment so a
failed run cannot silently reuse a result prefix.

Railway's connector currently rejects new Config as Code file selections. Do
not rely on a new `railway.json` descriptor for this task or migrate the whole
project to IaC merely to run the benchmark. Verify the effective build/start
configuration and actual numeric preflight before processing videos.

### Automatic event analysis (PR #95)

The authenticated Server endpoints are `POST` and `GET`
`/v1/manager/ocr/events/:event`. POST accepts an empty JSON object and returns
202 with the durable job ID. GET returns the queue state, per-match evidence
status, report/estimate counts and missing-input warnings. Access is limited to
verified team 8033 analysts and scouting leads using normal account tokens.
API keys cannot enqueue or inspect these jobs. Approved events are `2026cacg`,
`2026casnf`, and `2026cagle`; the event runner also checks the PR #95 Railway
service environment before importing any records.

Configure the API with `OCR_WORKER_URL` (the Worker's private Railway host and
port) and `OCR_CONTROL_TOKEN` (at least 32 random characters). Set the same
control token on the Worker. Do not give the Worker a public domain. The normal
Worker command remains `bun index.ts`; event work shares the existing scheduler,
lease renewal, retry/backoff and numeric progress logs. Event OCR runs at bounded
concurrency two by default; `OCR_EVENT_CONCURRENCY=1` provides a serial option. An accepted broadcast
version is reused on retry, and estimates are rebuilt from current reports.

By default, analysis uses reports already present in the preview database.
A direct scoped copy does not require a new production role or service.
Optionally, production reports can come from `tools/report-source-service.ts`,
deployed as a separate Bun service. It uses only the role provisioned by
`ops/ocr-report-source.sql`, which can select one event-restricted numeric view
and cannot select raw report tables. Apply that script through the approved
production migration owner, supplying `source_role` and `source_password` as
private psql variables; do not save passwords in SQL, Git or logs. Review and
approve the new data access before provisioning it.

The source service requires `PGHOST`, `PGPORT`, `PGDATABASE`,
`OCR_REPORT_SOURCE_USER`, `OCR_REPORT_SOURCE_PASSWORD`, and
`OCR_REPORT_SOURCE_TOKEN`. Its HTTPS endpoint accepts a bearer token and a UUID
cursor only. It excludes notes, scout names, training/practice reports,
accounts and join codes. Never configure it with the database owner's role.
Configure only `OCR_REPORT_SOURCE_URL` and the shared source bearer token on the
preview Worker; production database credentials stay with the source service.
Source exclusion flags are preserved; neither source nor preview exclusions are cleared.
Numeric report changes that conflict with an existing preview report stop the
sync for review rather than overwriting preview edits. Import batches are
atomic and repeat runs skip identical records.

The Worker also needs `TBA_KEY`, its existing `OCR_SERVICE_URL` and service token,
and the existing private `OCR_MEDIA_*` cache configuration. Set reviewed event
layouts using `OCR_EVENT_TEMPLATES` if the broadcaster differs from the default.
The generic FIRST layout is a candidate, not a promise of coverage: identity,
clock and evidence checks must pass on the actual broadcast. Public-provider
blocking opens a circuit for uncached downloads for the remainder of the pass;
cached videos can continue. Blocked videos remain `MEDIA_BLOCKED` and cause a
backoff retry, not a successful result. No browser cookies or operator media
imports are required or used by this workflow.

Native timing logs include selected layout, frame/sample counts, per-field
recognition stages, decoder waits, cache hits and runtime/model provenance.
`OCR_FUEL_WORD_FALLBACK=1` on the native service enables an experimental PSM 8
fuel recovery only after the normal reading fails. It keeps the 85 confidence
threshold and never replaces a valid primary reading; leave it disabled until
fixed-video Railway benchmarks and recovered counters have been reviewed.

### Railway baseline, 2026-10-29

Run `railway-baseline-20261029-a` used the fixed CalGames QM1, QM3, QM35 and
QM37 files, one decoder thread, the pinned model, two native CPUs and a native
capacity of two. Each video ran twice serially and twice at concurrency two;
the runner required identical media, evidence and runtime fingerprints across
repeats. These are processing measurements on already cached video, excluding
public download time and report import/fusion.

| Concurrency | Match runs | Total wall time | Throughput | Median request times across repeats | Peak sampled container memory |
|---|---:|---:|---:|---:|---:|
| 1 | 8 | 104.751 s | 4.582 matches/min | 12.334 / 13.045 s | 426 MiB |
| 2 | 8 | 86.160 s | 5.571 matches/min | 19.668 / 22.338 s | 555 MiB |

Concurrency two improved measured throughput by 21.6%, with higher individual
request latency. This supports the bounded event pool; it is not a universal
runtime claim for other broadcast layouts or an accuracy measurement. Numeric
phase records and evidence fingerprints remain in the existing private media
store under `benchmarks/calgames-resource/railway-baseline-20261029-a/`.

The two-decoder-thread comparison (`railway-decoder2-20261029-a`) preserved
all baseline evidence but reduced throughput: 4.458 matches/minute serially
and 4.682 at concurrency two, versus 4.582 and 5.571 with one decoder thread.
Keep `OCR_DECODER_THREADS=1` for this measured two-CPU setup.

The native processor also has a prepared-image cache, bounded to 128 entries
and 4 MiB per request (individual entries at most 256 KiB). Keys include image
geometry, numeric mode and page segmentation mode; a hash lookup is followed
by a complete byte comparison. It can reuse identical normalized/binary crops
across timestamps without approximating digits. It is disabled by default; `OCR_RECOGNITION_CACHE=1`
enables it for controlled comparisons. Field microbenchmarks deliberately
disable this cache so repeated pixels cannot distort recognition timings.

To evaluate a recovery policy, `OCR_RESOURCE_REFERENCE_MODE=extend` requires
all previously accepted paired and individual readings to remain present and
unchanged, while counting added observations. Repeated candidate runs must
still have identical evidence hashes. This guards regressions; newly recovered
readings still require independent validation. Keep the default `exact` mode
for pure runtime changes. A deliberate recognition-policy change needs a new
reviewed broadcast version before rerunning accepted event checkpoints.

The prepared-cache run (`railway-prepared-cache-20261029-a`) preserved all
baseline observations but measured 4.123 matches/minute serially and 5.472 at
concurrency two (eight runs per mode). It did not demonstrate a throughput gain,
so prepared-image memoization remains opt-in. These runs used separate native
deployments and do not isolate small timing differences from host variability.

Benchmark-only request overrides `OCR_RESOURCE_EXPERIMENT_WORD_FALLBACK=1`
and `OCR_RESOURCE_EXPERIMENT_RECOGNITION_CACHE=0` select recovery/cache modes
for those extraction requests. Ordinary event jobs do not forward tuning from
the public request body. The native service accepts only boolean tuning flags;
identity, confidence, resource limits and official accounting remain fixed.
