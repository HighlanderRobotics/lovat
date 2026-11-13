# Request telemetry

The Server emits one anonymous `response` event after each response finishes.
Use `route`, `method`, `statusCode` and `responseTime` for endpoint counts, error
rates and latency. Counts include anonymous callers and polling requests; this
changes the volume and meaning of older identity-dependent `response` events.
Static files served before the reporter, rejected JSON bodies and CORS failures
are outside this middleware's coverage. Compare trends across the deployment
boundary with that change in coverage in mind.

## Event contract

The event has a server-generated timestamp and the fixed distinct ID
`lovat-server`. Person-profile processing and GeoIP are disabled. Its properties
are limited to:

- `service`, `environment`, `railwayDeployment`: deployment configuration.
- `requestId`: fresh random UUID, independent of caller headers and identity.
- `method`: standard HTTP method or `OTHER`.
- `route`: registered Express route pattern under a known literal mount, or
  `unmatched`. Parameter values, query strings and unknown paths never appear.
- `statusCode`, `responseTime`: HTTP status and elapsed milliseconds.
- `errorCode`: `SERVER_ERROR` for 5xx, `REQUEST_ERROR` for 4xx, absent on success.
  These are coarse classifications, never application error messages or bodies.
- `cache`: `hit`, `miss` or `unknown`.
- `$process_person_profile: false`; the shared client also adds
  `eventSource: server` and the configured `environment`.

There are no request/response bodies, headers, URLs, IPs, user or scouter
identifiers, team codes, person properties or aliases. Telemetry performs no
PostgreSQL/Redis lookup. SDK capture failures log a constant message and cannot
change the HTTP response.

Mounts are explicitly allowlisted in `posthogMiddleware.ts`. Keep this list in
sync when adding literal router mounts. Parameterized and unknown mounts
intentionally aggregate under `unmatched`; never normalize by copying `baseUrl`
or `originalUrl` into an event. Route patterns must remain source-code constants.

## Post-deployment privacy review (LVT-334)

The code change prevents new request events from carrying sensitive data. It
does not delete historical events or change hosted PostHog permissions. A Lovat
PostHog project administrator must complete and record the following before the
issue's historical-data acceptance item can be closed:

1. Identify the actual project receiving `POSTHOG_PROJECT_API_KEY`, without
   copying the key into tickets or logs. Record project ID and reviewer/date.
2. Review historical `response` properties (`reqBody`, `resBody`, `query`, `path`,
   `$set`, `$ip`, team codes and person/alias associations), retention, exports,
   destinations and any downstream copies. Record the affected time range and
   approved remediation; verify deletion through the provider's supported tools.
3. Review project members, organization administrators, roles and service/API
   tokens. Record who retains access and why; restrict to the people operating
   Lovat. No live access policy has been verified by this implementation.
4. Check event volume and retention after deployment. Migrate existing charts
   from `path`/`$pathname` to `route`, remove person-level breakdowns, and verify
   endpoint totals, 5xx rate and latency using the anonymous schema.

Do not paste captured payloads into an issue as review evidence. Record only
safe metadata, decisions and confirmation of completed remediation.
