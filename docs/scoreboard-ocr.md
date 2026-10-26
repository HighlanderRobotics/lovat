# Scoreboard OCR and report review

This branch adds an opt-in 2026 pipeline. The Worker discovers match videos on TBA for tournaments attended by 8033. No production settings or data are changed by this branch.

## Processing

Set `OCR_ENABLED=true` and `OCR_SCOREBOARD_TEMPLATE` to a reviewed layout JSON. A candidate based on the FIRST 2026 broadcast is in `apps/worker/config/scoreboard-2026.candidate.json`; it is **not production calibrated**. Layouts select cumulative fuel counters, clock, match label, and all six team numbers. The total-points display is not a substitute for fuel. Verify crops throughout the full match, including three-digit counts, before enabling extraction.

`OCR_TOURNAMENT_KEYS=2026cacg` scopes both discovery and analysis to that event. With `OCR_BATCH=true`, pending matches are processed consecutively with a one-second scheduling delay; once every played match has a result, normal five-minute polling resumes.

The scheduler checks video availability every five minutes. It inspects at most five missing-video records and processes at most one match per job. It tries up to two YouTube videos because a robot-only camera may precede the broadcast in TBA's list. Missing videos do not block later matches. Rejected videos retry after six hours. Other import jobs continue normally; a database advisory lock permits only one OCR media job across Worker instances.

Videos must be individual matches shorter than ten minutes and no larger than 96 MiB. Processing uses one sampled frame per second, one CPU thread per media/OCR command, a 16 MiB frame buffer limit, and an eight-minute frame-processing deadline. Frames are streamed, not stored as an entire match's image set. Video, current frame and crops live in a unique temporary directory and are removed in `finally`, including failure paths. Normal process termination cleans them up; an abrupt container kill relies on ephemeral storage reclamation. Railway stores only extracted numeric observations, template version, video ID, status, and review evidence.

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

`apps/worker/config/scoreboard-2026-calgames.json` describes both overlay sizes used in the 2026 CalGames broadcasts. The extractor validates a layout on two separate frames before using it. Fuel counters remain distinct from the large points totals, and identity checks use stored canonical team IDs so offseason placeholder identities stay consistent with scouting reports.

Rejected full-match timelines retain their numeric observations for calibration. They remain `REJECTED` and never generate grading suggestions. No photos or video are stored in the database. Failed records are eligible for retry when the configured template version changes.
