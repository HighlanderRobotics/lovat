# Worker instructions

Use Bun 1.3.14 and the existing worker lockfile. Database schema/client remains owned by packages/db. Run bun run typecheck and bun test. Live integration tests require the explicit LOVAT_DB_TEST=1 disposable lovat_test database guard; never run them against production.

Cairn reporting is opt-in. Only job lifecycle metadata and health-route request metadata may leave the worker; never include target keys, lease tokens, provider bodies/errors, raw SQL, credentials, or scouting data. Success/failure observations follow the existing fenced scheduling write and cannot change job execution/retry state. Collector failures must be isolated. Preserve the current shutdown sequence and drain SDK queues after consumers finish.

The private SDK's reviewed source snapshot lives in packages/cairn-telemetry and is pinned by UPSTREAM.json. Build it before Bun copies the local file dependency; Docker and CI must include this package. Do not commit generated output or publish packages. Use a separate service-scoped lovat-worker ingestion token; examples remain disabled with empty secrets.
