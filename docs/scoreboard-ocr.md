# Scoreboard OCR and report review

This branch adds an opt-in 2026 pipeline. The Worker discovers match videos on TBA for tournaments attended by 8033. No production settings or data are changed by this branch.

## Processing

Set `OCR_ENABLED=true` and `OCR_SCOREBOARD_TEMPLATE` to a reviewed layout JSON. A candidate based on the FIRST 2026 broadcast is in `apps/worker/config/scoreboard-2026.candidate.json`; it is **not production calibrated**. Layouts select cumulative fuel counters, clock, match label, and all six team numbers. The total-points display is not a substitute for fuel. Verify crops throughout the full match, including three-digit counts, before enabling extraction.

`OCR_TOURNAMENT_KEYS=2026cacg` scopes both discovery and analysis to that event. With `OCR_BATCH=true`, pending matches are processed consecutively with a one-second scheduling delay; once every played match has a result, normal five-minute polling resumes.

The scheduler checks video availability every five minutes. It inspects at most five missing-video records and processes at most one match per job. It tries up to two YouTube videos because a robot-only camera may precede the broadcast in TBA's list. Missing videos do not block later matches. Rejected videos retry after six hours. Other import jobs continue normally; a database advisory lock permits only one OCR media job across Worker instances.

Videos must be individual matches shorter than ten minutes and no larger than 96 MiB. Processing uses one sampled frame per second, one CPU thread per media/OCR command, a 16 MiB frame buffer limit, and an eight-minute frame-processing deadline. Frames are streamed, not stored as an entire match's image set. Video, current frame and crops live in a unique temporary directory and are removed in `finally`, including failure paths. Normal process termination cleans them up; an abrupt container kill relies on ephemeral storage reclamation. The database stores only extracted numeric observations, template version, video ID, status, and review evidence. The processor retains no media; an optional private staging bucket can hold dedicated public match videos for cloud batches, as described in `scoreboard-fusion.md`.

Identity must match all six teams and the match label on two frames. Clock and fuel observations must have at least 85 OCR confidence, monotonic values, no gaps longer than three seconds, and at least 120 samples spanning the match. Unsupported broadcasts, camera-only videos, score corrections and incomplete timelines are rejected without modifying reports. The three-second auto/teleop transition is included in the continuous match clock.

## Review, exclusion and undo

A separate job analyzes validated observations no earlier than 15 minutes after the match. It revisits old evidence every 15 minutes to include late reports, up to 20 matches per pass. A scoring run needs both start and stop markers. Its window includes three seconds before shooting and five after, allowing for scoring delay. A review flag requires the recorded count to exceed the **entire alliance's** observed increase plus five fuel or 20%, whichever is larger. This is a review suggestion, not proof of an incorrect scout. Accuracy estimates, inactive hubs and broadcast delays require judgment. Simultaneous shooters are not assigned guessed individual shares, and this version does not change point estimates.

Flags begin in `REVIEW`; the Worker never automatically removes reports or events. This gate is intentional until thresholds are validated with reviewed real-match data. A same-team scouting lead, authenticated with a user session, can approve an exclusion or restore it. API keys and other teams cannot change these decisions. Review is serialized per report and invalidates affected analysis caches. Rescans never overwrite a reviewed decision.

Dashboard's raw report page shows a warning for pending or active flags and a Validation tab with evidence, original events, and review controls. An excluded report opens directly into its preserved evidence so the lead can undo its exclusion. Analysis and CSV metric reads omit excluded reports/events; raw Manager report and validation APIs preserve them.

- `GET /v1/manager/scoutreports/:uuid/validation`: source-filtered evidence, raw events, and `canReview`.
- `POST /v1/manager/scoutreports/:uuid/validation/:flagUuid`: `{ "status": "ACTIVE" | "RESTORED" }`; same-team leads only.

Deploy `20261026000000_scoreboard_ocr` before Server or Worker. The Worker image installs FFmpeg, Tesseract, and pinned yt-dlp from the Python package registry. Review extractor updates independently; YouTube format availability can change.

## Verification and remaining calibration

Unit tests cover evidence windows, low confidence, score corrections, missing samples, timing, overlapping shooters, and source filtering. The database integration test verifies video fallback, numeric persistence, review creation, idempotency, and preservation of a lead's restoration. Server tests cover ownership, roles, API-key rejection, invalid input, locking, and cache invalidation.

Before enabling this on a deployed environment, run the candidate against complete broadcast videos, compare extracted counts/times to reviewed samples and official score breakdowns, and measure false-positive flags. The current implementation intentionally does not claim calibrated automatic striking. A robot-camera video cannot validate a scoreboard; the same exercise may need separate robot and broadcast sources.

For local crop inspection without retaining additional images:

```sh
cd apps/worker
bun tools/inspect-scoreboard.ts /path/to/frame.png config/scoreboard-2026.candidate.json
```

The command prints recognized text, confidence, and fuel numerators, then removes its temporary crops. A correct-looking value below the confidence threshold is still rejected by the extraction pipeline.

## CalGames layout

`apps/worker/config/scoreboard-2026-calgames.json` describes the three reviewed overlay sizes used in the 2026 CalGames broadcasts. The extractor validates a layout on two separate frames before using it. Fuel counters remain distinct from the large points totals, and identity checks use stored canonical team IDs so offseason placeholder identities stay consistent with scouting reports.

Rejected timelines retain their numeric observations for calibration and never generate grading suggestions. Sparse but otherwise trustworthy timelines can instead be marked `PARTIAL`, subject to the interval checks below. No photos or video are stored in the database. Failed records are eligible for retry when the configured template version changes.

## Isolated Rust processor

`apps/worker/ocr-service` implements the native processor as a separate HTTP service. Bun still owns scheduling, tournament scope, database access, evidence validation, and review creation. The Rust service receives only a public match video, a reviewed layout, and the expected six team numbers and match label. It has no database credentials or report contents.

The reference extractor launches crop and OCR subprocesses repeatedly. The native service decodes once, crops/scales pixels in memory with FFmpeg's native scaler, and reuses a Tesseract engine. The short identity prefix is replayed after two-frame confirmation so late identity confirmation cannot hide autonomous start. Grayscale conversion occurs after cropping, and aligned scaler buffers restore their white clock border after SIMD writes. Both details affect confidence at small font sizes.

Bun FFI would save the HTTP upload but put native pointer errors and decoder failures inside the scheduler process. The separate Rust service contains those failures, exposes an independent health endpoint, and can be sized separately. A full libav decoder binding is deferred: one bounded FFmpeg decoder already removes the repeated-process bottleneck without adding codec lifetime management to Rust.

The service defaults to one job at a time and supports a bounded opt-in capacity of two (`OCR_CONCURRENCY=2`), returning 503 when full, requires a random bearer token of at least 32 characters, caps videos at 96 MiB/600 seconds, restricts media protocols and demuxers, and kills stalled probe/decoder subprocesses. Uploads use temporary files deleted on completion or error. Whole requests have a nine-minute deadline and decoding an eight-minute watchdog. Numeric responses are bounded and validated again by the Worker. Health is unauthenticated and contains no job information. Use private networking, with no public domain.

Local setup requires Rust, FFmpeg, Tesseract English data, and their development headers (`libswscale`, `tesseract`, and `pkg-config`). Build from the repository root:

```sh
cargo test --manifest-path apps/worker/ocr-service/Cargo.toml
cargo build --release --locked --manifest-path apps/worker/ocr-service/Cargo.toml
# Supply OCR_SERVICE_TOKEN securely; do not paste it into source or command history.
OMP_THREAD_LIMIT=1 PORT=8081 apps/worker/ocr-service/target/release/lovat-ocr-service
```

Set `OCR_SERVICE_URL=http://127.0.0.1:8081` and the same `OCR_SERVICE_TOKEN` on the Worker. Without the URL, the original extractor remains available for comparison. The service binds loopback by default. Its Dockerfile sets `OCR_BIND_HOST=::` for container networking; deploy the Dockerfile from the repository root and expose only the private service port. The Worker still downloads videos: a native service does not fix a video provider blocking a cloud IP. Keep that environment's OCR scheduler disabled until it has an accessible authorized source.

For reproducible comparisons, cache the same public video and run each backend sequentially with the same template, expected teams, and label:

```sh
cd apps/worker
bun tools/benchmark-ocr.ts /tmp/match.mp4 config/scoreboard-2026-calgames.json 100,9997,2643,1700,115,5940 "Qualification 1" /tmp/result.json
```

The benchmark records end-to-end extraction time and accepted numeric evidence. Download time is excluded; service time includes upload. Change only `OCR_SERVICE_URL`/`OCR_SERVICE_TOKEN` between runs. Compare `(time, red, blue)` values, rejected/accepted sample coverage, and monotonicity as well as time. Faster execution with fewer reliable samples is not a successful optimization. No broadcast videos or private scouting data belong in this repository.

### Partial timelines

`PARTIAL` means at least 120 confident, chronological, monotonic observations exist, but the full-match coverage check failed. The analyzer may propose reviews only inside dense observed intervals. Missing early frames or a gap elsewhere cannot discard an independently covered interval; a gap inside a claim's evidence window still prevents a review. Corrections, nonfinite values, low confidence, and decreasing counters remain rejected. Neither complete nor partial evidence automatically excludes a report.

### Initial benchmark (macOS, 2026-10-25)

CalGames Qualification 1, `calgames-2026-v3` profile, cached 720p public match video, one frame per second, unchanged confidence threshold (85), same CalGames layout and identity requirements:

| Extractor                            | Wall time | Accepted samples | Numeric comparison                           |
| ------------------------------------ | --------: | ---------------: | -------------------------------------------- |
| CLI reference, isolated repeat       |   139.6 s |              145 | Reference                                    |
| Rust service, including local upload |    23.2 s |              145 | All 145 `(time, red, blue)` tuples identical |

This is approximately **6× faster** on one video, not a whole-event performance guarantee. An earlier reference run overlapped development work and took 178.1 seconds; use the isolated repeat above for comparison. The other CalGames layout (Qualification 37) took 21.5 seconds and yielded 121 usable observations. Both videos have coverage gaps and are `PARTIAL`, not fully validated timelines. Matching the reference establishes parity, not a manually measured OCR error rate. Runtime memory/CPU limits and Linux Tesseract builds still need measurements on the eventual service host. The initial CalGames calibration batch used the local Rust service because the video provider blocks Railway downloads. The Railway event runner now accepts the same public match videos from a private staging bucket and performs native OCR and TBA-aware fusion in the cloud; see `scoreboard-fusion.md` for explicit environment/source scoping and checkpointed outputs.

The v4 CalGames profile additionally handles the lower timer position used after the broadcast graphic changes. Both implementations require confident clock crops to agree when more than one reviewed position is readable. Phase tracking accepts an already-started autonomous clock in the first 30 video frames and verifies the autonomous-to-teleop transition against elapsed video time; it never interpolates missing fuel counters.

Confident but implausible clock readings are also rejected against elapsed video time. For example, OCR reading a clipped `1` instead of `1:32` cannot advance the timeline to the last second of the match.

### Native profiling and repeatable suites

`tools/benchmark-native.ts` retains paired readings, independent alliance readings, confidences, and optional native stage timings. Give it a JSON array of cases with `matchKey`, an existing public `video` file path, six distinct canonical `expectedTeams`, and `expectedMatchLabel`. It uses the same reviewed template and authenticated service client as the Worker:

```sh
bun tools/benchmark-native.ts --cases /path/to/cases.json --template config/scoreboard-2026-calgames.json --output /path/to/empty-results --label baseline --rounds 2
```

Set `OCR_SERVICE_URL` and `OCR_SERVICE_TOKEN` through the environment. The tool refuses a nonempty output directory, records each media SHA-256 and numeric-evidence SHA-256, and reports elapsed upload/extraction time plus sample counts. Download time is excluded. Compare identical media hashes and full numeric evidence before comparing timings. Use sequential alternating baseline/candidate runs, without compilation or other benchmark jobs running concurrently. Keep benchmark videos and generated results outside Git.

Native profiles include probe time, decoder read wait, identity, clock, counter, total Tesseract recognition time, recognition calls, and cache hits. These are inclusive wall times: recognition occurs inside identity/clock/counter stages, so do not add them together. Decoder read wait is not a measure of decoding CPU time. Older service responses without profiles remain supported.

The optional `profile.fields` further separates actual recognition calls and microseconds by field (`text`, `fuel`, `points`, `clock`) and preprocessing stage. `confidentSyntax` is the number meeting the confidence/grammar gate, not a correctness metric. Field call totals must reconcile with `recognitionCalls`. The `runtime` object records the loaded Tesseract version, language and model SHA-256. Benchmarks reject a model/library identity change within a run. Set `OCR_EXPECTED_MODEL_SHA256` to fail startup and requests if loaded weights do not match the expected hash.

`config/ocr-models.json` pins official fast and stronger English weights by immutable revision, size and SHA-256. Stage a comparison model outside Git with `bun tools/stage-ocr-model.ts --model best --output /path/to/empty-directory`, then point the native service's `TESSDATA_PREFIX` there. The staging tool rejects incorrect sizes/hashes and nonempty output directories. Do not change the deployed model based on package names or confidence alone; compare independently labeled fields, coverage and runtime first.

The native Docker image installs the audited fast weights directly from their immutable official revision, verifies SHA-256 during the build, retains the model's license, and enforces that hash at runtime. It no longer relies on a distribution package choosing the same weights. This preserves the model bytes previously verified in the PR preview; the Tesseract library still comes from Debian and its actual version remains recorded in each result.

For resource experiments, `OCR_DECODER_THREADS` accepts only 1, 2 or 4 and defaults to one; filter threads remain one. Invalid settings fail before serving. The response records `profile.decoderThreads`. `python3 tools/benchmark-decoder.py --cases /path/to/cases.json --output /path/to/new-directory --rounds 2` compares identical decoded RGB streams in opposite-order repeats, records child CPU/RSS, and rejects any pixel/frame-count change. On Linux, add `--require-cpus 2` to require that actual cgroup CPU quota. An unconstrained Mac result is exploratory, not evidence of throughput under Railway's CPU cap. Decoder-only measurements exclude OCR and do not select production concurrency.

The native binary also provides an operator-only local crop experiment: `lovat-ocr-service --benchmark-fields /path/to/cases.json /path/to/new-output.json`. It starts no HTTP listener and needs no service token. Cases contain an `id`, a local `rawRgb` file in 1280-wide packed RGB24, its `height` (1..720), and up to eight fields with `id`, `rect` and `kind`. It compares scale, segmentation, borders and normalization in reversed repeated order using the same native scaler/recognizer. Raw frames must have exactly the declared dimensions; case/field IDs must be unique. Reference labels are rejected by the input contract and remain separate. Existing output files are never replaced. No experimental preprocessing setting is exposed to the request API.

`bun tools/select-field-profiles.ts GRID_JSON REFERENCES_JSON NEW_OUTPUT_JSON` ranks crop profiles only on train/calibration fields, then evaluates reserved test fields. Reference cases use IDs such as `2026cacg_qm1-v16`, a match-level `split`, `sourceRgbSha256`, and numeric `values` by field ID. It rejects changed pixels, duplicate/incomplete grids and match/pixel leakage across splits. False accepted values and unstable repeats rank before coverage and measured cost. Retries retain the existing 4x normalized/binary path. The crop baseline includes the existing 20-pixel primary clock border. These metrics exclude video-clock plausibility, agreement between clock crops and cache savings, so full-video evaluation is still required.

`bun tools/benchmark-report-alignment.ts INPUT_DIRECTORY EMPTY_OUTPUT_DIRECTORY 1967,8033` evaluates report-specific net-lag identifiability on frozen CalGames fusion inputs without changing production estimates. It requires four isolated reliable bursts and validates on alternating bursts unused in fitting. It abstains near phase boundaries, competing shooting, sparse/corrected OCR and inconsistent lags. Outputs retain input hashes and source scope. The lag combines reporting and physical/display delays; HP or unreported shooting cannot be ruled out by scout isolation. Even a qualifying candidate remains experimental pending independent validation.

`bun tools/inventory-event-videos.ts 2026cacg MATCHES_JSON PLAYLIST_JSON NEW_OUTPUT_JSON` records all scheduled qualifications, including ones without a linked upload. It separates missing links and missing uploader metadata from successful processing; linked IDs are not proof that a video is publicly downloadable. An exact current-year uploader title supplies only a candidate, subject to the normal native identity checks. A YouTube processing response is pending media availability; the Worker retains the short `NO_VIDEO` retry and never uses it as rejected scoreboard evidence.

`tools/prepare-media-transfers.ts` is a separately invoked one-shot private helper, not part of the default Worker. It opens no HTTP listener, reads no database, and accepts an explicit list of at most 59 CalGames public-video IDs and a deadline within one hour. It skips existing objects and signs PUT only to each selected `media/2026cacg/VIDEO_ID.mp4` key. Its capability output belongs only in private project logs and must never be published or committed. Replacing a live helper and granting its temporary bucket access requires the specific approval pending in this task; preparing this source does not deploy it.

For independent robot/HP validation, run `bun tools/prepare-blind-review.ts /path/to/public-selection.json /path/to/empty-review-directory`. Each selection entry contains only `matchKey`, `split` (`calibration` or `heldout`), `videoKey`, its canonical YouTube `url`, and three public team IDs in each of `red` and `blue`. The strict input contract rejects extra fields. The local reviewer form excludes splits and predictions, leaves all counts unknown and records separate auto/teleop rows for six robots and two human players. Download labels before closing the page. Keep manifests and labels outside Git, freeze held-out labels before evaluation, and never use manual labels to override production estimates.

Clock parsing requires a valid seconds field: `1:32` and `92` are accepted, while `0:90`, `1:032`, and `2:2` are rejected. All clocks remain bounded by the 140-second teleop timer and elapsed-video plausibility checks. Native recovery validates the actual crop grammar (fuel, points, clock, or text), so a confident string valid for a different field cannot prevent the existing normalization retries. These safeguards do not establish measured robot attribution accuracy.

The native decoder scales and converts to RGB before retaining only the top band required by every configured field and alternate layout, with guard rows. The original coordinate system and crop pixels remain unchanged; layouts using the bottom of the frame retain full-height decoding. Frames with unusable clocks skip fuel reads. Identity checks test the match label first and stop at an unreadable or duplicate robot, while a successful identity still requires all six expected robots and the same two-frame confirmation rule.

The 2026-10-27 comparison used QM1, QM3, QM35, and QM37, two baseline and two optimized runs per video, in baseline/optimized/optimized/baseline blocks. Compilation and the exploratory profiling pass were excluded. Mean upload/extraction time fell from **26.96 s to 24.73 s (8.3%)**; median time fell from 27.01 s to 23.80 s. The eight-sample p95 did not improve (30.20 s to 30.74 s), so this does not establish a tail-latency improvement or whole-event throughput. All paired readings, points, independent alliance channels, confidences, and decoded frame counts matched exactly on all four videos.

| Match | Baseline mean | Optimized mean | Tesseract calls |
| ----- | ------------: | -------------: | --------------: |
| QM1   |       27.59 s |        23.91 s |   2,013 → 1,542 |
| QM3   |       27.39 s |        26.63 s |   2,245 → 1,541 |
| QM35  |       25.32 s |        22.49 s |   1,563 → 1,006 |
| QM37  |       27.54 s |        25.87 s |   1,374 → 1,017 |

The earlier decoder/clock-only candidate had mixed per-video runtimes and is not counted as a demonstrated standalone speedup. Failed identity work was the important additional reduction. The CalGames decoder transfers 197 rather than 720 RGB rows per frame (72.6% fewer bytes). That comparison still retained full-height coordinate buffers; the follow-up below removes that storage overhead. Observed service-lifetime peak RSS was about 75 MiB for baseline and 88 MiB for optimized; these different lifetimes covered 16 and eight requests respectively and are not a controlled memory comparison. Memory limits/concurrency were not increased. The v7 CalGames profile advances all layout revision identifiers for the recognizer hardening, with unchanged crop coordinates. Existing artifacts remain preserved. At that checkpoint all 138 Worker tests and 23 Rust tests passed. These changes preserve the current attribution estimates and do not resolve QM3's known HP overcredit.

### Compact reusable frame buffers

The follow-up retains only the decoded band in memory while keeping crop coordinates in the original 1280×720 space. Every crop must fit inside the actual buffer before its pixels or pointers are accessed. The decoder reserves its 64 guard bytes up front. Identity-prefix frames move into the bounded replay queue without cloning RGB storage. A request-local pool keeps one spare allocation; an ownership guard returns it on normal completion, early continues, and errors. No buffers are shared between requests. Profiles expose optional `frameAllocations` and `frameBufferBytes`; older native responses remain supported.

A balanced baseline/candidate/candidate/baseline comparison on the same four cached videos used eight requests per process. Observed peak RSS fell from **99.06 MiB to 54.83 MiB (44.7%)**. Mean elapsed time was essentially unchanged: 19.839 s versus 19.872 s. This is a memory/allocation improvement, not a demonstrated latency improvement. Each RGB buffer contains 756,544 bytes including guards instead of 2,764,864, and allocation is reused throughout the stream. These are buffer payload lengths, not total process-memory figures.

| Match | Decoded frames | Candidate RGB allocations |
| ----- | -------------: | ------------------------: |
| QM1   |            172 |                         9 |
| QM3   |            176 |                        12 |
| QM35  |            174 |                        10 |
| QM37  |            171 |                         7 |

The baseline allocated for every decoded frame and cloned identity-prefix frames. All paired readings, independent channels, confidences, frame counts, and actual Tesseract call counts were unchanged across both repeats. Two simultaneous requests for QM1 and QM37 also retained identical evidence and independent buffer counts. These are local cached-video results, not a Railway-wide memory guarantee. The 138 Worker tests and 26 Rust tests pass, including compact/full crop equality, unavailable-row rejection, ownership transfer, bounded spare storage, and early-exit recycling.

A separate request-local exact prepared-image memoization trial saved only 8–26 Tesseract calls per video while retaining roughly 3–4 MiB. It was removed; the existing exact RGB/grayscale crop cache remains unchanged. Confidence thresholds, sampling, phase handling, and attribution policy are unchanged.
