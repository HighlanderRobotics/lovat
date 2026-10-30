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

## Coverage recovery (v3)

The v6 CalGames crop profile covers three broadcast sizes. The native reader retries uncertain crops with normalized polarity/contrast and a binary variant, and can segment roster digits when the word recognizer confuses a narrow `1` with punctuation. All six expected robots and the match label still need two frame confirmations. Numeric scoring observations retain the 85 confidence threshold. Alternate clock crops must fit the observed video timeline before they can veto one another, and a stray early clock cannot move an established origin.

Video-level estimation coverage is distinct from a complete timeline or eligibility for review flags. A TBA-backed estimate needs at least half the 163-second match covered by observed intervals no longer than three seconds, an autonomous observation, and a reading at or after 155 seconds. `coverage` records the actual sample count and dense-time fraction; gaps remain unattributed. The review validator still requires 120 chronological, monotonic readings. This replaces the inappropriate use of that global review sample-count gate for every estimate; it does not claim that every second or every robot's fuel attribution is known.

For TBA-backed estimates, a counter retraction censors earlier conflicting anchors without editing or interpolating their values. Raw observations remain in the artifact. `diagnostics.counterCorrections` records the discarded timestamps, and intervals within six seconds of the discrepancy receive no robot attribution. A TBA-only remainder is also left unattributed after a correction. The legacy no-TBA estimator continues to reject corrections. Official phase budgets and total-point conservation are still enforced.

`OCR_CONCURRENCY=2` permits two isolated native jobs and `OCR_BATCH_CONCURRENCY=2` enables the matching bounded Worker pool. Both default to one and reject values above two. Checkpoint writes are serialized, and fatal failures drain in-flight work before exiting. Exact crop caching skips repeated recognition only when pixels are unchanged. Decoding stops after the last feasible match/settling observation, and the decoder is explicitly terminated and reaped. These controls improve throughput without dropping potentially valid observations.

The local recovery pass processed all 37 available first-day videos with all six robot identities verified. Every video met the TBA-estimation time-coverage gate and passed official phase/total-point conservation checks. Dense-time coverage ranged from 73.0% to 99.4%, with a median of 93.3%; this is interval coverage, not a measured digit-accuracy rate. Five passed the full-timeline gate; the remaining videos retain partial coverage and explicit uncertainty. Two contain counter discrepancies handled by the quarantine policy.

On the same cached Qualification 1 video, early termination reduced extraction from 29,016 ms to 25,322 ms, preserving all 156 accepted readings exactly (about 13% less elapsed time). Both runs used the recovery recognizer; this isolates the termination optimization rather than comparing different accuracy policies. It is a single-video benchmark, not a whole-event speed guarantee.

A mixed concurrent-request check also preserved the exact sequential observations for Qualifications 1 and 11 (156 and 146 readings respectively). The two native engines therefore passed both same-video and different-video concurrency regression checks on the cached inputs.

The v3 Railway rerun processed all **37/37** available first-day videos with zero rejections, processing errors, or phase/final-point conservation failures. Four passed the full-timeline gate and 33 retain partial coverage. Dense-time coverage had a minimum of 73.0% and a median of 93.3%. All raw readings, coverage metrics, explicit correction diagnostics, and estimates are stored privately under `runs/calgames-tba-v3-coverage-20261026/`; `audit.json` records the independent checks. This achieves video-level coverage without claiming complete timestamps or measured per-robot attribution accuracy. The prior v2 run remains preserved separately.

## Independent alliance evidence (v4)

The native service now preserves `channels.red` and `channels.blue` alongside the original paired `observations`. Each entry is an actually read counter, with its own counter/clock minimum confidence of 85. An unreadable blue digit no longer discards a valid red reading. The original paired array, full-timeline review gate, and older v3 artifacts remain compatible.

TBA fusion uses each alliance's own timestamps and correction quarantine. Retractions still censor conflicting anchors; they never rewrite digits. In v4, a counter interval longer than three seconds remains unattributed rather than distributing a broad missing interval among plausible shooters. Phase fuel, tower, foul credit, and final points still conserve official budgets. Batch artifacts report paired coverage and separate alliance coverage, so independent recovery cannot be confused with a complete paired timeline.

Native optimizations reuse per-request scaler contexts and check exact source pixels before allocating/scaling an unchanged crop. The existing exact grayscale cache remains as a second check. A changed pixel is never treated as approximately equal. Padding and SIMD guard bytes are reset, and tests compare reused/fresh scaler pixels across positions, frames, and padding. The batch sends its already staged file directly to the native service, avoiding a second local copy and duplicate probe; the native size, duration, identity, decode, and timeout checks remain enforced.

Six cached public videos (QM1, QM16, QM33, QM35, QM36, QM37) retain byte-for-byte identical paired observations after the native changes, and all six conserve official phase/final points. Independent dense coverage improves QM16 red from 126 to 156 seconds, QM33 blue from 122 to 152, and QM35 blue from 145 to 158. These are same-file local comparisons; Railway's staged encodings can produce different readings. The 121 Worker and 18 Rust tests, Worker typecheck, Clippy with warnings denied, formatting, and repository structure checks pass.

A four-run alternating QM1 benchmark (baseline, optimized, optimized, baseline) produced identical 156-reading output each time. Baseline runs were 28,583 and 33,310 ms; optimized runs were 25,783 and 27,299 ms. Mean elapsed time fell from 30,946.5 to 26,541 ms (14.2%). This is a small single-video sample with visible timing variation, not an event-wide throughput guarantee.

The v4 Railway audit completed **37/37** available first-day videos with no final errors, rejections, or phase/final-point conservation failures. Every paired observation array matched its v3 artifact exactly. Independent alliance channels recovered **437 additional dense alliance-seconds** compared with requiring both counters together. QM29 red improves from 119 to 159 seconds, QM33 blue from 122 to 152, and QM16 red from 130 to 156. Median independent-alliance coverage is 96.9%; the paired median remains 93.3%, with four full and 33 partial paired timelines. Results are preserved separately under `runs/calgames-tba-v4-independent-20261026/`. Deployment-rollover busy responses were retried from checkpoints before this audit. Temporary helper bucket access was revoked afterward.

Human-player scores are part of the alliance counter. If they overlap a robot's scout scoring window, the current estimator can credit them to that robot. Complete OCR and official budget conservation cannot resolve that ambiguity. Manual references must separate human-player entries before being used to report individual robot error; included but unseparated human-player counts provide bounds, not exact robot ground truth. The estimator now states this limitation explicitly rather than treating manual calibration totals as a production allocation rule.

## Manual fuel verification set

Choose these matches before looking at estimated robot counts, to build an independent reference:

| Match                                               | Red robots      | Blue robots      | Why count it                                                                                                  |
| --------------------------------------------------- | --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| [QM3](https://www.youtube.com/watch?v=C3Cn3asisYo)  | 846, 852, 1967  | 8, 4159, 4990    | Clean paired timeline: baseline OCR and attribution check.                                                    |
| [QM5](https://www.youtube.com/watch?v=HDNknl2FlI0)  | 841, 5499, 6962 | 253, 751, 766    | Clean OCR with extensive overlapping scout scoring windows: tests robot attribution separately from OCR gaps. |
| [QM16](https://www.youtube.com/watch?v=aHVDrCM76Ok) | 846, 2473, 4990 | 766, 4765, 10252 | Counter correction and long unreadable intervals: tests recovery and conservative unknown allocation.         |

Record each robot's actual hub entries separately for auto and teleop, with video timestamps for each burst. Separate misses, feeds, inactive-hub entries, and human-player shots. Mark obscured entries as uncertain (or a range), rather than inventing counts. Keep inactive-hub entries distinct when comparing counts with point budgets; [the game manual](https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm) distinguishes hub activity and point eligibility. Compare manual counts with estimates only after counting: report per-robot auto/teleop absolute error, signed bias, and unattributed fuel. Video/interval coverage alone is not an accuracy measurement.

## Source-balanced phase consensus (v5)

A small positive claim used to be averaged down by contradictory reports, then normalized back up against the whole scoreboard increment. That could credit a robot despite stronger no-score evidence. V5 requires strictly more than half of source-balanced report votes to claim scoring in each phase. Every source team has one equally weighted vote; submitted reports within a source share that vote. Auto agreement cannot certify teleop, and display/arrival padding does not create a phase claim. A disputed candidate retains its proportional share as unattributed fuel rather than donating it to another robot. No match-specific manual allocations or thresholds are used.

The read-only CalGames replay used 812 scoped reports for the 37 available videos. Before applying v5, it reproduced all 37 saved v4 team allocations. V5 remained byte-identical after report/event/roster/counter permutations, with zero phase/final conservation failures. Unattributed fuel increased from 460 to 989 across the set: this is a deliberate uncertainty tradeoff, not proof that the remaining robot allocations are accurate. Human-player overlap and imperfect scout timing still limit per-robot estimates. The full Worker suite has 126 passing tests; targeted tests cover source conflicts, equal source weighting, independent phase eligibility, unknown-share retention, and export reconciliation.

Future event artifacts retain their already scoped numeric `fusionInput` so estimates remain reproducible if the database changes. This excludes scout notes and account/contact information. A missing report set is explicitly labeled `REPORTS_MISSING` rather than described as a report-backed estimate.

Create a local, reproducible contribution export from input JSON files (or saved batch artifacts containing `fusionInput`):

```sh
bun tools/export-contributions.ts --input /path/to/inputs --output /path/to/empty-export --source-teams 1967,8033 --expected-matches 37
```

The export contains `team-contributions.csv` (six team rows per match, auto/teleop fuel and tower contributions), `alliance-reconciliation.csv` (unknown fuel, unknown points, and alliance-only foul credit), full `estimates.json`, and a hash/input-provenance `manifest.json`. The command refuses duplicate matches, inconsistent budgets, a wrong expected count, or a nonempty destination. Private exports and recovered source snapshots must stay outside Git.

## Accuracy references and timing sensitivity

Run the offline benchmark against the same scoped inputs used for an export:

```sh
cd apps/worker
bun tools/benchmark-fusion.ts --input /path/to/inputs --references /path/to/manual-references --output /path/to/empty-benchmark --source-teams 1967,8033 --expected-matches 37
```

Each reference JSON identifies one match and contains `evidence`, `notes`, `robotCounts`, and `humanPlayerMinimums`. A robot count has `teamNumber`, `alliance` (`RED`/`BLUE`), `phase` (`AUTO`/`TELEOP`/`TOTAL`), integer `minimum`/`maximum`, and `basis` (`ROBOT_ONLY`/`UPPER_BOUND_INCLUDES_HP`). Only an exact robot-only label contributes to exact-subset MAE and signed bias. An HP-inclusive label must have minimum zero: it is an upper bound, not an exact robot count. Unlabeled robots/phases are not treated as zero. Human-player minima contain `alliance`, `phase`, and `fuel`; they bound the maximum possible robot fuel without assigning HP fuel to any robot. Duplicate identities, inconsistent phase/total bounds, and impossible count budgets are rejected.

The tool reports the distance outside each permitted range as a **minimum absolute error**. Being within a range does not establish accuracy. Zero-only exact labels are explicitly identified because correctly rejecting inactive robots does not measure positive-scorer accuracy. AUTO/TELEOP and TOTAL summaries overlap; HP constraints can also overlap robot errors. Do not add them together. The existing QM3 manual reference includes unseparated HP fuel and has already informed development; it is a calibration check, not a held-out robot-only accuracy set.

The timing experiment uses a fixed, symmetric seven-offset sweep from −3 to +3 seconds in one-second steps. Positive offsets move attribution windows later on the OCR timeline. Original source-balanced phase votes, quantities, OCR values, correction quarantine, and official phase budgets are preserved. Zero offset must reproduce baseline robot allocations. Every candidate is checked for conservation and determinism after report/event/roster/counter permutations. Experimental results have a distinct algorithm identifier and input hash. The queue and production estimator continue to use the unchanged v5 timing policy; no candidate is selected automatically, and scout lag cannot be distinguished from scoreboard delay by this sweep alone.

Outputs include `benchmark.json`, `robot-reference-comparison.csv`, `human-player-constraints.csv`, `timing-sensitivity.csv`, `timing-robustness.csv`, and file hashes in `manifest.json`. Robustness rows show each robot's baseline and minimum/maximum auto, teleop, and total fuel across the fixed sweep. These are sensitivity ranges, **not statistical confidence intervals or bounds on actual fuel**. Keep manual references and numeric match outputs outside Git.

The 2026-10-27 replay evaluated 259 candidates across the same 37 CalGames matches. Zero offset reproduced the previous export; all candidates conserved official totals and were deterministic after permutation. Moving windows one second earlier changed 118 of 222 robot rows; one second later changed 120. On QM3, moving three seconds earlier reduced the auto upper-bound violation from seven fuel to two, but introduced a three-fuel total upper-bound violation for another robot. Baseline red robot allocation also exceeded the maximum permitted by the user-confirmed HP minimum by at least seven fuel. This demonstrates timing sensitivity and an unresolved HP-attribution problem, not evidence for promoting a global timing shift. The full Worker suite now has 135 passing tests.
