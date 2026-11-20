# Game rules and metrics

`@lovat/games` contains pure, versioned game modules with no database connections, HTTP runtime, environment configuration, or provider calls. The Bun/Hono API consumes the package; other TypeScript services can use the same rules. Game descriptors and JSON Schemas are published through `@lovat/api` for other languages.

## Adding a season

1. Create a module with a stable ID, season and game version. Define its report schema and report version with Zod.
2. Put periods, scoring constants, ranking rules, timing validation and plausibility checks in the module.
3. Prepare shared facts once per report. Define metrics with `defineMetricFor<Facts>()`: declare metadata/output schema, calculate compact report states, reduce states within a match, and aggregate matches/tournaments. Use `defineDerivedMetricFor<Facts>()` for dependencies.
4. Add a predictor when supported. It selects required metrics and receives scoped team analyses; alliance size comes from game rules.
5. Register the module in `src/catalog.ts`. New games use the versioned JSON report table and generic HTTP/analysis code without season-specific database columns.
6. Add fixtures for scoring, timing, invalid input, aggregation, prediction and historical upgrades. Run package checks and the API database suite.

The fictional 2099 fixture in `test/fixtures.mjs` demonstrates different fields, scoring, periods, alliance size, structured metrics and report-schema upgrades. It is never registered in production and makes no claims about a future official game.

## Versions and storage

Game versions select an immutable rules contract. Report versions select an input schema; explicit older codecs upgrade historical payloads. Preserve old game versions and codecs when rules change. Metric formula versions participate in cache keys and must change with calculations.

The 2026 module retains current scoring and scouting-clock conventions. Its typed legacy adapter prepares facts directly from database columns, avoiding an extra wire-payload graph. Only trusted typed adapters use `fromFacts`; arbitrary client and stored JSON payloads pass through their report codec. The engine keeps compact metric states and prepares one report at a time.

## Client and feature work

`GET /v3/games` publishes rules, report/metric JSON Schemas and prediction capability. Collection submits a stable envelope to `POST /v3/reports`; the game owns its `data`. Analysis and predictions select season and game version.

Adding a module does not automatically change Collection or Dashboard screens. Clients must consume descriptors or supply their game-specific UI. Existing v1/Collection lifecycle, training grading, six-station schedules and CSV adapters retain 2026 contracts. Generic report review/deletion/flags, worker reassessment of generic reports, and future-game training/schedule support remain follow-ups before a future-season rollout.

## Checks

Use Node 22.20.0 and this package's npm lockfile:

```sh
npm ci
npm test
npm run lint
npm run format:check
```

The package depends on built `@lovat/api`. It introduces no root workspace or cross-application imports.
