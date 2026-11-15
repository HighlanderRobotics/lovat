# Server rewrite qualification

The replacement is independent of legacy Server handlers. All 137 legacy HTTP routes map to replacement modules and policies in `apps/api/legacy-routes.json`; native v3 endpoints and training WebSockets are additional surfaces. Registration checks prevent missing handlers but do not prove behavioral parity.

## Current evidence

Local PostgreSQL 18 and a Redis-compatible Memurai service were used only with synthetic fixtures and run-specific key namespaces. The new database suite covers report load/start/end/submit, repeated and conflicting submissions, atomic invalidation, cross-team denial, picklists, API keys, analysis, CSV/path views, signed email verification, joining, training pairing/readiness/control/submission/grading, and browser/attempt socket authentication. The worker suite covers durable claims, retry fencing and recovery. Shared schemas have no database/runtime side effects.

The deployment image limits V8 old-space to 256 MiB. Cold calculations, exports and path calculations share bounded work admission; HTTP and SQL concurrency are separately bounded. A maximum dataset is accepted explicitly; larger datasets fail with 413.

## Local latency measurements

Node 22.20.0, local warm PostgreSQL, local Redis, all 31 metrics, synthetic authenticated scope. Client and API share a process. Identity database reads, JWKS verification/fetch, production networking and deployment overhead are excluded.

| Reports / events | Requests, concurrency 1 | Uncached p95 | Warm Redis p95 |
| ---------------- | ----------------------: | -----------: | -------------: |
| 100 / 2,000      |                      20 |     18.99 ms |        2.52 ms |
| 1,000 / 20,000   |                      20 |    115.52 ms |        2.03 ms |
| 5,000 / 100,000  |                       5 |    713.27 ms |        7.22 ms |

At four concurrent requests, p95 was 369.92 ms uncached and 5.29 ms cached for 1,000 reports. At the maximum dataset it was 2,371.19 ms uncached and 11.51 ms cached; the small maximum-workload sample is diagnostic, not a release percentile estimate. Peak process RSS over the maximum run was about 407 MiB, including fixture setup and client work. The heap limit is not a total-memory limit.

The first unconstrained 1,000-report run reached about 479 MiB peak RSS; the subsequent queue/heap-budget run reached about 302 MiB. Both configuration changes were applied together, so this does not isolate their individual effects. It also does not compare against the legacy server.

Reproduce with `LOVAT_DB_TEST=1`, a loopback PostgreSQL URL ending in `/lovat_test`, a loopback `REDIS_URL`, and `node apps/api/tools/benchmark-http.mjs` after building. Set `BENCHMARK_REPORTS=5000 BENCHMARK_ITERATIONS=5` for the maximum-size diagnostic. Fixture records and cache keys are cleaned up by the tool.

## Compatibility and release review

- Shared API definitions are extracted and consumed by Server, the replacement and worker. The package includes TypeScript contracts/client and OpenAPI artifacts. Flutter bindings remain unchanged; generated Dart migration is tracked in LVT-377.
- v1 analysis adapters use the unified 2026 metric engine. Rate pooling, missing values, weighting and CSV headers can differ from legacy endpoint-specific calculations. Review fixtures and consumer output before rollout.
- Pit display now requires caller authentication and uses caller source scope. Scout renames and management writes enforce team/lead ownership. Public team-code recovery masks the returned contact address and queues at most one delivery per team per two-minute bucket.
- Catalog defaults are paginated. Large analysis/export selections return explicit limits. Review consumers that previously relied on unlimited responses.
- Official schedule, result and roster imports belong to the worker; requests do not run imports. Official ranking/webcast reads use a bounded, timed cache. Exercise provider failures and stale schedules in staging.
- Redis publication is monotonic and cache TTL bounds delayed invalidation. Delivery is at least once; email idempotency keys and Slack message IDs reduce duplicates but cannot guarantee exactly-once remote delivery after a timeout.
- The existing Server remains the deployment target. Apply additive migrations through the release owner, configure matching Redis prefixes and delivery credentials, qualify the replacement worker flag, then rehearse rollback before routing traffic.
- Public abuse budgets use the socket peer address. Validate reverse-proxy addressing and actual scout traffic before production rollout.
- An equivalent old/new workload, sustained soak test, container image build and real Auth0/Slack/Resend staging checks are still required for release. The local results above must not be presented as production guarantees.
