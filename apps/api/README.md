# Replacement Lovat API

Ground-up implementation for [LVT-243](https://linear.app/highlander-robotics/issue/LVT-243). This application does not import or delegate to legacy handlers. Existing production deployment still uses `apps/server`; changing the traffic target is a separate release action.

## Structure

- `http/` owns routing, payload limits and authorization policies.
- `services/` owns accounts, API keys, Collection, reports, schedules, onboarding, training, analysis, predictions, events, exports and Slack. The composition root lists each module and records route ownership.
- `repository.ts` owns source-scoped analysis reads and dataset limits.
- `metrics/` owns pure metric definitions, fact preparation and aggregation.
- `domain/` owns report validation/persistence, grading and transactional effect creation.
- `identity.ts`, `state.ts`, `signatures.ts` and `sockets.ts` provide identity, Redis, signed callbacks and training transport.
- `@lovat/api` owns reusable report, Collection lifecycle, training, metric and error schemas. Its optional legacy export supplies the extracted OpenAPI definitions; its effects export defines the worker protocol.

All 137 inventoried HTTP routes have registered replacement handlers, plus v3 analysis/metadata and the training WebSocket transport. Registration coverage is checked automatically. It does not establish complete behavioral parity: see [qualification evidence](../../docs/server-rewrite-qualification.md).

## Local setup

Use Node 22.20.0. Build `packages/db` and `packages/api` with their own npm commands, then run `npm ci` and `npm run build` here. Copy `.env.example` to a private `.env`, verify the database URL, and apply reviewed migrations through the release/database owner. The API never runs migrations or provider imports during startup or requests.

Start with `node --env-file=.env dist/server.js`. Readiness probes PostgreSQL and Redis; liveness remains available while draining. Configure the worker with `API_EFFECTS_ENABLED=true`, matching Redis URL/prefix, and the relevant delivery credentials when testing the replacement. The existing Server does not enable this flag automatically.

Auth0 JWT signatures use cached JWKS. Existing users require one authoritative local identity read; only a new subject fetches its initial profile. API keys are hashed and checked against current ownership on every request, so revocation takes effect immediately. Collection uses a team code and scout identity independently of Auth0. Training browser/attempt tokens are stored as hashes. v1 signed-in analysts retain analysis access without team membership; v3 requires a verified team.

Slack callbacks verify the raw request HMAC. OAuth states are random, expire after ten minutes and are consumed atomically. Configure the exact allowed browser origins for HTTP and training sockets. Native clients may omit Origin.

## Resource and latency controls

The API admits four HTTP requests and uses a four-connection PostgreSQL pool with an eight-second statement timeout. Expensive cold analyses share one work slot and at most four queued calculations, with a five-second queue wait. Cache hits bypass that queue. The deployment image sets a 256 MiB JavaScript heap limit; this is not a limit on total process RSS.

Analysis reads at most 5,000 reports and 100,000 events. Detailed exports also check the combined note/description size before loading text, with a 4 MiB limit. Oversized requests return 413 rather than silently averaging a truncated dataset. v3 bodies are limited to 64 KiB; lifecycle/legacy bodies to 1 MiB. Catalog requests are paginated, with a maximum page of 500.

Source, role, team, formula version and dataset revisions participate in analysis cache keys. Cache lifetime is 15 seconds, in-flight requests coalesce, and Redis cache failures fall back to current calculations. Report writes and invalidation revisions commit together in PostgreSQL. The worker publishes monotonic revisions and delivers durable email/Slack effects with retries. Training submissions create neither competition revisions nor robot warnings.

Identity and public recovery/Collection rate limits use atomic Redis budgets and fail closed if controls are unavailable. Public limits currently use the socket peer address; a reverse proxy must be considered during deployment qualification.

## Adding a metric or feature

Define a metric with `defineMetric` or `defineDerivedMetric`:

1. Declare its stable ID, aliases, season, formula version, unit, precision and required facts.
2. Supply its Zod output schema, including structured output when needed.
3. Calculate a pure per-report state.
4. Reduce report states into a match value.
5. Define how match and tournament values combine.

Register it in the season registry and add representative fixtures. The registry publishes output JSON Schema, resolves dependencies once, detects cycles and exposes the metric through the generic endpoint. The loader fetches events only when required, and shared facts avoid scanning the same timeline for each metric.

For a new API feature, put reusable request/response definitions in `packages/api`, add its owning service module, register its authorization policy in the composition root, and add behavior coverage. Do not import another application's source.

## Metric semantics

All 22 numeric metrics and nine categorical breakdowns are implemented for 2026. Reports contribute equally within a match; matches contribute equally within a tournament. Rates pool quantities and valid durations before dividing. Later tournaments receive 80% weight at each recency step, ordered by date and key. Missing values stay distinct from measured zero. Points apply the accuracy scale once and keep climb bonuses separate.

Autonomous ends at 23 elapsed seconds. Successful climb timing uses time remaining. Multi-select categories describe prevalence and can sum above one. Internal calculations retain precision; v3 rounds at the response boundary. These consistent formulas resolve legacy endpoint disagreements, so v1 analysis/CSV differences must be reviewed before switching existing clients.

## Verification

Run:

```sh
npm test
npm run lint
npm run format:check
npm run inventory:check
```

For disposable loopback services named `lovat_test`:

```sh
LOVAT_DB_TEST=1 LOVAT_REDIS_TEST=1 DATABASE_URL=postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test REDIS_URL=redis://127.0.0.1:6379 npm run test:integration
```

The database suite exercises native HTTP, lifecycle retries, tenant denial, analysis, exports, API keys, signed verification, joining, training and authenticated WebSockets. Redis tests cover atomic budgets, one-time OAuth state and cache expiry. CI provisions disposable PostgreSQL and Redis.

`npm run inventory` records each legacy route's replacement module and policy. Its coverage field explicitly describes registration only. `npm run benchmark` measures the pure engine. `tools/benchmark-http.mjs` measures local HTTP, PostgreSQL and Redis with synthetic identity; use the same disposable-service guard above. Neither benchmark establishes production latency or an old/new comparison.

Build the image from the repository root with `docker build -f apps/api/Dockerfile .`. External-provider staging, consumer compatibility, soak tests, rollback rehearsal and traffic cutover remain release gates.
