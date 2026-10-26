# Deterministic scoreboard/scout fusion

`apps/worker/tools/estimate-match.ts` produces an estimate from the exported match bundle containing `matchKey`, six `slots`, `ocr.observations`, and `reports[].events`. It reads files and writes a result; it does not modify reports, review flags, point estimates in the database, or the database itself.

## Run

From the repository root, with an input that already contains total-score OCR:

```sh
bun apps/worker/tools/estimate-match.ts \
  --input /tmp/logs-with-points.json \
  --output /tmp/estimate.json \
  --source-teams 1967,8033
```

For existing exports that have only fuel counters, run the isolated native OCR service and set `OCR_SERVICE_URL` and its shared `OCR_SERVICE_TOKEN` securely. The command can automatically re-extract total-score digits from the dedicated public video identified in the input:

```sh
bun apps/worker/tools/estimate-match.ts \
  --input /tmp/logs.json \
  --output /tmp/estimate.json \
  --source-teams 1967,8033 \
  --template apps/worker/config/scoreboard-2026-calgames.json \
  --enriched /tmp/logs-with-points.json
```

`--video /tmp/match.mp4` uses a cached copy instead of downloading again. Non-qualification videos require `--match-label` matching their reviewed broadcast title. Normal match/robot identity and confidence checks still apply. The CalGames v5 profile includes crops for the large total-point digits, distinct from the fuel numerator. The optional point fields have their own confidence threshold and do not weaken fuel confidence checks. At repeated clock timestamps, native extraction can retain later nondecreasing point updates so delayed scoring at 0:00 is visible.

Input/output exports can include private scouting data; keep them outside Git. Only the public video, roster numbers, match label, and layout go to the native OCR service. The fusion computation runs locally.

## Algorithm v1

1. Validate match identity and the six-team roster. Require an explicit source-team allowlist and honor report/event exclusions. Discard low-confidence OCR readings. Reject conflicting timestamps, counter decreases, and contradictory final fuel/point totals instead of silently repairing them.
2. Sort by numeric team, source team, report UUID, event time, and event UUID with explicit tie rules. Pair each `START_SCORING` with its `STOP_SCORING`; a stop without a start does not get an invented shooting interval. Feeding and intake actions cannot receive scoring credit.
3. Give each paired cycle a uniform relative rate based on its recorded quantity, using a fixed one-second early and five-second late timing window. Average report rates within each source team, then average the independent source teams equally. Identical scoring timelines within a team/source are deduplicated. Several scouts watching one robot do not imply several robots scoring.
4. For each observed alliance fuel increase, calculate each robot's share from the overlapping consensus rates. Retain fractional shares as integer millionths. Perform one final largest-remainder rounding over the whole observed match, with numeric team order breaking exact ties. Rounding every one-point interval separately would systematically favor the lowest-numbered team.
5. Reconcile to the **last confidently observed total-score reading**. The active-HUB fuel counter supplies one point per scored fuel under the [2026 manual, section 6.5.3](https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm). Scout `points` fields do not set any budget. Unexplained non-fuel points, which may include tower scores or penalties, remain in an unattributed bucket. Fuel increases with no supporting scouting interval also remain unattributed.
6. Assert that estimated team points plus unattributed points equal the observed scoreboard total exactly, for each alliance.

The output contains the versioned policy, a SHA-256 of normalized semantic inputs, team estimates, report/source coverage, per-interval support and fractional allocations, diagnostics, and reconciliation totals. It contains no generated timestamps, random choices, learned weights, hand-entered robot allocations, or per-match tuning. The same semantic input and source-team scope produce byte-identical JSON even when input arrays are reordered.

## Interpretation

These are team estimates constrained by observed alliance data. Simultaneous shooting does not establish which robot scored an individual piece. Sparse intervals retain a measured cumulative difference but do not supply an exact shot time. The first cumulative reading includes the observed prefix from the game's zero starting score; the prefix is marked sparse when appropriate.

The result stops at the latest accepted point reading and reports any unobserved tail. Even a reading at 0:00 does not prove that all later official adjustments have appeared. Conflicting or corrected OCR needs review rather than forced attribution. The script does not automatically strike reports or replace official scores.

## Official phase budgets, fouls, and tower awards (v2)

Supply `--tba-file /tmp/tba-match.json` to use a cached official match snapshot, or `--fetch-tba` with `TBA_KEY` supplied securely in the environment. `--enriched` stores the public TBA snapshot alongside the original scoped reports and OCR for reproducible reruns. Cached snapshots make the same inputs byte-reproducible; refreshing TBA may legitimately change the result. With TBA present, fuel OCR alone is sufficient: total-score digits remain useful for comparison but no longer truncate the official result.

V2 validates the match, the alliance rosters, station order, phase sums, tower totals, and the final score. Offseason participants with different canonical IDs require an explicit `slots[].externalParticipantKey` mapping; the code never maps tower statuses by sorted robot number.

- `hubScore.autoCount` is the cumulative auto/teleop cutoff. A delayed OCR interval that crosses that count is split into auto and teleop quantities, rather than classifying all its fuel by the displayed timestamp.
- Report timing has a fixed ±2-second allowance. The matching window also allows 3 seconds of FMS scoring delay and 1 second of OCR/display delay. These are versioned bounds, not learned or manually tuned per match. Auto candidates must be compatible with physical time 0–20; teleop candidates must be compatible with 23–163. The 3-second transition is not added to teleop fuel a second time.
- Every phase is apportioned against its own official fuel point budget. Fractional shares are retained across readings and rounded once per phase. Auto and teleop reconcile separately before being summed.
- Official fuel remaining after the last OCR reading is labeled `TBA_REMAINDER`. A bounded late tail can use report evidence in an inferred settling window through 167 seconds. Its timing is explicitly inferred, never inserted into `ocr.observations`. A long missing tail or missing auto evidence remains unattributed.
- `autoTowerRobot1..3` and `endGameTowerRobot1..3` map to the corresponding TBA alliance station. Standard rule values are assigned only when they are compatible with the official tower budget. Missing or inconsistent awards remain unattributed. Tower points join the appropriate auto or teleop total.
- `foulPoints` is **credit awarded to the receiving alliance**, not a robot's scoring credit. It is shown separately. Minor/major foul counts describe the committing alliance, but TBA does not identify the offending robot or the phase of every foul.
- TBA endgame fuel is a subset of teleop fuel. It is displayed as context and never added again. Endgame tower points are a separate teleop component.

The official result can close gaps in the live scoreboard. The result retains `observedScoreboardPoints`, `observedFuel`, `fuelOCRThrough`, and the official remainder so that official totals do not masquerade as OCR observations. Each alliance satisfies:

`team auto + team teleop + unattributed + awarded foul points = official total`.

This improves scoring constraints and phase accounting; it does not establish measured accuracy for per-robot fuel attribution. Existing input files without TBA continue to use the v1 path.

## Railway event batch

Cloud IPs can be blocked by YouTube even when native OCR is healthy. Stage public, dedicated match videos into a private S3 bucket, then run `bun tools/run-event-batch.ts` in the Worker image. The runner downloads one staged object at a time, calls the private native service, reads only explicitly scoped scouting sources, and runs TBA-aware fusion. It does not rewrite scouting reports, exclusions, or stored metrics. Rejected timelines retain numeric evidence without producing an estimate.

Set `OCR_BATCH_EVENT`, a unique `OCR_BATCH_RUN_ID`, `OCR_BATCH_SOURCE_TEAMS`, and `OCR_BATCH_ENVIRONMENT_ID` (must equal the service's `RAILWAY_ENVIRONMENT_ID`). Supply the existing native-service/template/TBA settings and bucket references through `OCR_MEDIA_ENDPOINT`, `OCR_MEDIA_BUCKET`, `OCR_MEDIA_REGION`, `OCR_MEDIA_ACCESS_KEY_ID`, and `OCR_MEDIA_SECRET_ACCESS_KEY`. Private artifacts are saved as `runs/<run-id>/<match-key>.json`, with a checkpointed `summary.json`. Completed/rejected matches resume from checkpoints after restart; use a new run ID when changing inputs or policies. Keep one replica for this one-shot run. Restore the normal Worker start command afterwards.

`tools/media-relay.ts` is an optional temporary Railway Function for staging when local S3 credentials are unavailable. It has no database access. Its upload signer requires a strong bearer token, a fixed expiry, and an explicit video-ID allowlist; signed upload URLs expire in ten minutes. Only the helper's health endpoint is unauthenticated. Remove its public domain and disable its token after staging. Never log tokens or signed URLs. The bucket and numeric result artifacts remain private.

The CalGames Railway run on 2026-10-26 processed all 37 matches with published videos: 11 produced TBA-aware estimates and 26 failed the existing OCR evidence gates. The independent artifact audit checked auto, teleop, and final-point conservation for every estimate with zero failures or processing errors. Rejections are retained separately and never represented as zero scores. This is successful execution and accounting validation, not a measured attribution-accuracy result. Outputs and `audit.json` are in the private bucket under `runs/calgames-tba-v2-railway-20261026/`. The temporary public upload domain was removed and its token revoked after staging.
