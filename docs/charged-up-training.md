# Charged Up training

The existing training branch now supports Collection's 2023 Charged Up report format. The website at `/training/start` follows the Marketing Materials training frames: start, match selection, QR lobby, paused pre-match video, playback, report submission, and results. The 2026 training endpoints remain compatible with older exercises; the new website requests the 2023 catalog explicitly.

## Run and deploy

Apply the reviewed Prisma migrations, then deploy Server, Website, and the updated Collection client together. Website needs `LOVAT_API_BASE` for server-side API calls and `LOVAT_PUBLIC_API_BASE` for the browser's WebSocket connection. Both must point to the same Server environment. Production browser origins must be under `lovat.app`, as enforced by the existing socket origin policy.

On the website choose a match, then scan its QR with Collection. Every scout needs a configured team code and scout identity; the first participant locks the session to that team. Next opens the paused video. Scouts choose their starting position and press Ready; Play enables only when all participants are connected and ready. Playback, seeking, buffering interruptions, and reloading are handled by the existing synchronized-session controls. Interrupted attempts cannot be submitted. Ended attempts can retry uploads until the six-hour session expires; submitted reports accept only identical retries.

## Exercise content

No 2026 video or answer key is relabeled as Charged Up. To publish a real exercise, provide an embeddable YouTube clip, its exact match-start offset, and a reviewed 2023 answer key captured with Collection. Match/tournament/team-slot records must already exist and agree with the key. The catalog displays an empty state until a valid exercise is imported.

Use `tools/import-charged-up-exercise.ts` with Node 22.20.0 and an explicitly selected `DATABASE_URL`. It validates by default; `--apply` creates a new exercise. Existing exercise UUIDs cannot be overwritten; use a new UUID for revisions so active sessions keep their reviewed key.

```sh
node --import tsx tools/import-charged-up-exercise.ts /absolute/path/exercise.json
node --import tsx tools/import-charged-up-exercise.ts /absolute/path/exercise.json --apply
```

Input fields: `uuid` (new exercise UUID), `matchKey`, `videoLink`, `startOffsetSeconds`, `alliance` (`RED`/`BLUE`), `excludedFields` (optional array), and `answerKey` (the complete 2023 Collection report). The clip must contain the full 150-second match after the offset. Review playback manually before publishing. Exclude subjective or unobservable questions such as `driverAbility` or `defenseEffectiveness` when no reliable reference can be established.

## Grading and isolation

The Charged Up rubric uses cone/cube totals (25% each), one-to-one timeline matches (30%), and included post-match answers (20%). Timeline matches require the same action, field location, and scoring node within two seconds; starting position allows five drag-bar points. Extra and missing events reduce the timeline score. Role arrays compare independent of order. Passing requires 80%.

2023 reports and grades live in `TrainingAttempt.payload` and `TrainingAttempt.score`, with the answer and submitted report snapshotted when graded. They never create 2026 `ScoutReport` or event rows, enter competitive analysis, or trigger competitive report notifications. Answer keys remain private until results disclose expected graded values; full keys and session credentials are never returned by the catalog. Custom post-match answers are retained but not graded.

## Verification

Unit tests cover grading, timing tolerance, extra events, role order, excluded questions, and piece/node constraints. Disposable PostgreSQL integration tests cover pairing, source-team isolation, readiness, lifecycle upload, invalid timelines, idempotent grading, and WebSocket authentication. Synthetic test fixtures are explicitly labeled and are not production training content.
