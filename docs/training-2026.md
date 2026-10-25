# 2026 scouting training

Open `/training/start` on the Website, choose an exercise, and scan the pairing QR code with a device running the 2026 Collection app. Each scout must already have a team and scouter selected. A session belongs to the first team that joins it.

The host moves the lobby to pre-match after scouts connect. Scouts choose their starting position and mark themselves ready. Playback starts only when every participant is connected and ready. Reloading, seeking, or interrupting playback invalidates that attempt; start a new session instead of submitting a partially watched match.

The results screen compares fuel scored and fed, event timing, autonomous and endgame climbing, roles, and field traversal. Expand a scout's name for individual field and shooting-run differences. The passing score is 80%. Subjective or unobservable fields can be excluded by the exercise author.

Training uses the existing 2026 report format. Training reports carry `training = true` and are filtered out of competitive analysis. Pairing and participant access use separate tokens; answer keys are not returned in the exercise catalog. See [the report lifecycle contract](collection-reports-in-progress.md) for API and storage details.

## Deployment

- Deploy the eight additive report-lifecycle/training migrations in `packages/db/prisma/migrations/2026101400*` before deploying Server.
- Set Website `LOVAT_API_BASE` to the Server URL. Set `LOVAT_PUBLIC_API_BASE` when the browser needs a different public Server URL. The public URL must support `/collection/training/socket` WebSocket upgrades.
- Install a 2026 Collection build with the training deep link. The Charged Up app is maintained on a separate offseason branch.
- For PR #93 device testing, use Collection's `training-pr-93` EAS profile. It targets `https://api-lovat-pr-93.up.railway.app` and inherits the internal preview signing configuration. Team/scouter credentials must belong to that preview environment.
- The 2026 app stores history under `historyStore2026`. It imports valid 2026 entries from the older shared key while preserving the original Charged Up history.
- Publish reviewed exercise records and their training answer keys in the target database. This PR does not populate or modify a deployed database. `tools/seed-training-exercise.ts` is restricted to the disposable local `lovat_test` database.

## Regression checks

- Server: `npm test`, `npm run build`, `npm run typecheck:test`, and `npm run lint`.
- Disposable local PostgreSQL: `LOVAT_DB_TEST=1 npm run test:integration -- test/trainingFlow.integration.test.ts test/collectionLifecycle.integration.test.ts` with the local test `DATABASE_URL`.
- Collection: `npm test`, `npm run ts:check`, `npm run lint`, and `npm run format:check`.
- Website: `npm run test:training`, `npm run check`, `npm run lint`, and `npm run build`.
