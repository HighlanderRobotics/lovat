# Replacement Lovat API

Independent implementation for [LVT-243](https://linear.app/highlander-robotics/issue/LVT-243). This application does not import or delegate to legacy server handlers. Production deployment still uses apps/server.

## Implemented

- Locally verified Auth0 JWTs using cached JWKS, followed by an authoritative local user/source-scope read. No per-request Auth0 profile fetch or user upsert.
- GET /v3/metrics and POST /v3/analysis, using @lovat/api contracts.
- All 22 current numeric metric IDs and nine categorical breakdowns, with explicit aggregation and aliases.
- Shared fact preparation, dependency resolution, custom typed functions, structured result schemas and optional timelines.
- Source-team/tournament, season, reliability, training and practice restrictions at the repository boundary.
- Bounded request size, result dataset and concurrent work; safe errors, request IDs, minimal logs, CORS allowlist, liveness/readiness and graceful draining.
- Legacy route inventory and a deterministic synthetic engine benchmark.

This is a working first slice of the full rewrite, not a replacement ready for traffic cutover. API keys, Collection identity/lifecycle, onboarding, training sockets, management, predictions, exports, cross-service cache invalidation, Dart clients and end-to-end migration remain tracked in LVT-370–378. Unsupported routes return 404; there is no legacy proxy fallback. Do not direct existing clients at this application yet.

## Local setup

Use Node 22.20.0. Build the shared database package first with npm ci and npm run build in packages/db. Then run npm ci and npm run build here. Copy .env.example to .env and set the intended local database and Auth0 issuer/audience. Start with node --env-file=.env dist/server.js.

The API starts on port 3001 without running imports or migrations. GET /health/live reports process liveness; GET /health/ready probes PostgreSQL and fails while draining. Established users must already exist from onboarding through the current application. v3 currently accepts Dashboard JWTs only. Stored source rules fail closed when malformed.

No analysis cache is enabled in this first slice. Results use current database state; removing legacy PostgreSQL cache checks is coordinated with worker writes in LVT-375. Rate-limit parity and distributed abuse controls must be completed before rollout. Concurrent work defaults to four with a four-connection database pool and an eight-second SQL statement timeout. Dataset limits are 5,000 reports and 100,000 events per request, and request bodies are limited to 64 KiB. Dataset overflow returns an explicit error instead of silently truncating.

## Add a metric

Use defineMetric in src/metrics/registry.ts with:

1. Public metadata: stable ID/aliases, season, formula version, unit, precision and required fields/facts. The registry publishes a JSON Schema derived from each output schema so clients can inspect structured results.
2. A Zod output schema, including a structured schema when needed.
3. A pure report-state calculation.
4. A reducer that combines report states into a match value.
5. Explicit aggregation across matches and tournaments.

Register the definition in the season registry and add fixtures. No controller, query switch or client payload change is needed for another compatible metric. Use defineDerivedMetric for a metric depending on existing match metrics; the registry validates missing dependencies and cycles at construction.

The loader resolves required data for all requested metrics together. Scalar-only requests do not fetch events. Every report's events are sorted once and converted into shared counts, quantities, paired durations, point totals and climb times. Timelines are built only when requested.

## v3 semantics requiring review before migration

- Numeric metrics average scouting reports within each match, then weight matches equally within a tournament.
- Scoring/feeding rates pool quantities and valid active time within a match before division. A missing duration returns null, while a measured zero quantity over positive duration returns zero.
- Tournaments are ordered by date then key; later tournaments receive 80% weight at each recency step. Missing tournament dates sort first.
- Points apply the existing accuracy scale (25/55/65/75/85/95 percent) to scoring points once. Missing accuracy leaves scoring unadjusted. Climb bonuses are separate.
- Autonomous ends at 23 elapsed seconds. Climb start values use successful attempts and time remaining (23 for auto, 158 for teleop), matching the current team-analysis convention.
- Repeated action starts keep the earliest unclosed start. Unpaired stops do not create durations. Scoring/feeding intervals under 0.5 seconds do not contribute active time.
- Multi-select breakdowns describe prevalence per report/match; categories can sum above one.
- samples counts valid matches; null and zero remain distinct. Internal calculations retain precision; rounding occurs only at HTTP output.
- These choices deliberately resolve disagreements between legacy endpoints and must be reviewed against fixtures before consumer migration. They do not silently change v1 behavior.

## Verification

Run npm test, npm run lint, npm run format:check and npm run inventory:check. The isolated tests exercise HTTP, source restrictions, auth guards, aggregation, aliases, dependency cycles and custom structured outputs without private services.

Run npm run inventory to refresh legacy-routes.json from static TypeScript router declarations. Its null replacement fields explicitly mean unmigrated routes; it does not include static assets, wildcard middleware routes, or WebSocket protocols. LVT-370 owns complete behavioral specifications and authorization parity.

Run npm run benchmark for synthetic pure-engine workloads at 100, 1,000 and 5,000 reports. It prints p50/p95/p99, process CPU and a memory snapshot, excluding authentication, SQL and network costs. It is not a production end-to-end latency claim or a peak-memory/soak benchmark. Compare equivalent old/new workloads before setting release budgets.

Build the isolated image from the repository root using docker build -f apps/api/Dockerfile . after the feature and operational gates pass. No live Railway service is changed by adding this Dockerfile.
