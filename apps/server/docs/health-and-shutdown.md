# API health and shutdown

`GET /live` returns HTTP 200 and `{"status":"live"}` while the process can
answer HTTP. It performs no dependency checks. `GET /ready` returns HTTP 200
with `{"status":"ready"}` only after initialization completes and PostgreSQL
and Redis probes succeed. Otherwise it returns HTTP 503 with
`{"status":"not_ready"}`. Both responses use `Cache-Control: no-store`, bypass
body parsing, analytics and API rate limits, and disclose no connection errors.

PostgreSQL **and Redis are critical** for the current API: authentication,
verification and analysis paths use Redis without a general outage fallback.
Treating Redis as optional would send traffic to handlers that can still fail.
Readiness uses `SELECT 1` and a ping on the existing ready Redis connection.
It never creates a Redis connection. Concurrent probes share one check, results
are cached for one second, and responses have a one-second deadline. A driver
call still pending after timeout is reused instead of creating accumulating
queries. A recovered dependency is checked again after the short cache expires.

`GET /status` retains its legacy HTTP 200 text response for existing callers.
It is process status only; new deployment checks must use `/ready`. The OpenAPI
reference documents all three paths. This does not remove the current startup
TBA imports; that is separate LVT-335 work.

## Termination

SIGTERM and SIGINT invoke the same idempotent shutdown path:

1. Readiness becomes false and recurring background timers stop.
2. The HTTP listener stops accepting connections. Subsequent requests that
   arrive on an existing connection receive HTTP 503 with `Connection: close`.
3. Training WebSockets reject new upgrades and close with code 1001. In-flight
   snapshot work finishes before the database client closes.
4. After HTTP and WebSocket draining completes, PostgreSQL and Redis close and
   PostHog flushes/shuts down. The process exits successfully only if cleanup
   succeeds. Cleanup errors use a constant log message, without provider errors.
5. A ten-second deadline covers draining and cleanup. Stuck HTTP connections
   and WebSockets are destroyed and the process exits unsuccessfully for retry.

The container runs Node directly, including in the Railway override, so Node
receives termination signals. The proposed Railway settings use `/ready` and a
15-second drain window, leaving room for the application's ten-second deadline.
The database migration still runs once per existing API start command;
LVT-338 owns moving that to a release job.

## Preview, production and rollback verification

The committed IaC is a proposal. A merge does not apply it. Read-only inspection
of Lovat production, staging and PR #128 on November 12, 2026 confirmed the API
still uses `/status` and the npm start wrapper. The `/ready` setting and live
shutdown/rollback acceptance items remain unverified until this version is
deployed and the reviewed IaC change is applied.

With access to the correct project:

1. Save the existing API config/deployment IDs and verify isolated preview
   PostgreSQL/Redis. Follow the root `.railway/README.md` cutover/plan procedure.
2. Deploy the image containing `/ready` **before** applying a healthcheck-path
   change. Confirm `/live` is 200 and `/ready` becomes 200 after initialization.
3. In a disposable preview, disconnect each critical dependency independently;
   `/live` must stay 200 and `/ready` must become 503 within the probe/cache
   bounds (roughly two seconds). Restore it and verify recovery. Never exercise
   this fault injection on production dependencies.
4. Send SIGTERM during a slow HTTP request and an active training connection.
   Verify the response completes, WebSocket close code is 1001, new connections
   fail, and cleanup finishes within the drain window. An intentionally stuck
   request should hit the ten-second forced-close deadline.
5. Review/apply the readiness and drain settings through IaC. Verify production
   after preview evidence is recorded; preserve existing staged changes.
6. When rolling back to an image without `/ready`, restore the saved `/status`
   healthcheck configuration **before** deploying the older image. For a newer
   image that supports `/ready`, keep readiness enabled. Record the actual
   rollback deployment and health results without copying secrets into tickets.
