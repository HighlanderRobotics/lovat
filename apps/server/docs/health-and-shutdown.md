# API health and shutdown

- `GET /live` returns HTTP 200 with `{"status":"live"}` whenever the process can
  answer HTTP. It performs no dependency checks.
- `GET /ready` returns HTTP 200 with `{"status":"ready"}` after initialization,
  while not draining, and when the existing Redis connection answers a bounded
  ping. Otherwise it returns HTTP 503 with `{"status":"not_ready"}`.
- `GET /status` keeps its legacy HTTP 200 text response during normal service.
  It is not a dependency check.

The new endpoints use `Cache-Control: no-store`, bypass body parsing,
analytics and API rate limits, and expose no connection errors. Readiness
does not create a second Redis connection. Concurrent probes share one check,
results are cached for one second, and responses have a one-second deadline.
A stalled ping is reused rather than piling up more pings. There is no new
background health polling.

Neither HTTP probe checks PostgreSQL. A running API can report ready while
PostgreSQL is asleep or unavailable. Real database-dependent requests can wake
it, wait, or fail. Startup still uses PostgreSQL for one-time initialization,
and the existing Railway start command still runs database migrations. A
request that cold-starts the API can therefore indirectly wake the database
even if it only asks for health.

## Explicit PostgreSQL verification

During a release or investigation, use the intended environment's approved
private database connection and verify its target before running this command.
Configure connection and authentication outside the command line (for example,
using PostgreSQL's service/password files or an approved operator SQL console).

```sh
PGCONNECT_TIMEOUT=5 PGOPTIONS='-c statement_timeout=5000' \
  psql -X -v ON_ERROR_STOP=1 -c 'SELECT 1;'
```

Expect one row containing `1`. This confirms SQL connectivity for that
connection and will wake a sleeping database. Do not schedule it as a health
poll. It does not prove migration or application behavior; verify those with
the release smoke checks in the intended environment.

## Termination

SIGTERM and SIGINT invoke the same idempotent shutdown path:

1. Readiness becomes false and new Redis probes stop.
2. The HTTP listener stops accepting connections. Subsequent API requests on
   an existing connection receive HTTP 503 with `Connection: close`.
3. Training WebSockets reject new upgrades and close with code 1001. In-flight
   snapshot work finishes before the database client closes.
4. After HTTP, WebSocket work and in-flight Redis readiness probes drain,
   PostgreSQL and Redis close and PostHog flushes queued telemetry. Cleanup
   failures are logged without provider error details.
5. A ten-second deadline covers draining and cleanup. At the deadline, stuck
   connections are destroyed and the process exits unsuccessfully.

The repository's Docker image runs Node under Tini, which forwards termination
signals. This change leaves Railway service settings unchanged. Verify signal
forwarding and the actual drain window if the environment overrides the image
command. LVT-338 owns moving startup migrations to a release job.

## Preview, production and rollback verification

The existing Railway deployment healthcheck remains `/status`. [Railway's
deployment healthcheck](https://docs.railway.com/deployments/healthchecks) is a
startup gate, not a continuous uptime monitor. External uptime probes can
wake a sleeping API, and health verification is not proof that production
PostgreSQL will sleep.

1. Save current API deployment/settings and use an isolated preview. Deploy
   the image before considering a separate change to the healthcheck path.
2. Confirm both `/live` and `/ready` return 200 once initialized. Then stop
   preview PostgreSQL without restarting the API: both probes should remain
   200 if Redis stays healthy. Restore PostgreSQL and run the explicit SQL
   check and a representative database-backed request.
3. Disconnect isolated preview Redis without restarting the API: `/live`
   should remain 200 and `/ready` should fall to 503 after its cache and
   deadline (roughly two seconds). Restore Redis and check readiness recovers.
   Never exercise either fault on production dependencies.
4. Send SIGTERM during a slow HTTP request and an active training connection.
   Verify drain, close code 1001, and exit within the available window. Verify
   a stuck request reaches the forced-close deadline.
5. If a separate rollout adopts `/ready`, first verify the image provides it.
   Restore the saved `/status` healthcheck before rolling back to an older
   image without `/ready`. Record observed preview and rollback results.
