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
