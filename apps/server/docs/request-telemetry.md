# Request telemetry

The Server emits one `response` event after each response finishes.
Use `route`, `method`, `statusCode` and `responseTime` for endpoint counts, error
rates and latency. Counts include anonymous callers and polling requests; this
changes the volume and meaning of older identity-dependent `response` events.
Static files served before the reporter, rejected JSON bodies and CORS failures
are outside this middleware's coverage. Compare trends across the deployment
boundary with that change in coverage in mind.

## Event contract

Every event has a server-generated timestamp and disables GeoIP. A verified
JWT or API key uses the existing account ID and enables person-profile
processing. The authenticated account's role, public FRC team number, and
`userType: user` are the only person properties that this event updates. API key
events are attributed to the owner, not the key or the person using it.
Requests without verified account authentication use the fixed distinct ID
`lovat-server` with person-profile processing disabled. Collection verifies team
access or report ownership on some routes, but a shared team code and supplied
scouter UUID are not independent proof of a person's identity, so Collection
requests remain anonymous.

Event properties are limited to:

- `service`, `environment`, `railwayDeployment`, `railwayReplica`, `gitCommit`:
  deployment configuration.
- `requestId`: fresh random UUID, independent of caller headers and identity.
- `method`: standard HTTP method or `OTHER`.
- `route`: registered Express route pattern under a known literal mount, or
  `unmatched`. For matched patterns, `$pathname` is a compatibility alias.
  Parameter values, query strings and unknown paths never appear.
- `statusCode`, `responseTime`: HTTP status and elapsed milliseconds.
- `errorCode`: `SERVER_ERROR` for 5xx, `REQUEST_ERROR` for 4xx, absent on success.
  These are coarse classifications, never application error messages or bodies.
- `cache`: `hit`, `miss` or `unknown`.
- `appVersion`, `appBuild`, `$os_name`: unverified client hints in narrow
  numeric release formats or a known OS label. Missing or invalid hints are
  omitted; do not use these as evidence of authentication.
- `userType`, `authType`, `teamNumber`, `role`, `$set`: for verified account
  authentication only. `$process_person_profile` is true only in that case.
  The shared client also adds `eventSource: server` and the configured
  `environment`.

There are no request/response bodies, raw or full URLs, query strings, IPs,
names, emails, team codes, auth tokens, scouter IDs, device IDs, or identity
aliases. No raw header collection or extra PostgreSQL/Redis lookup is performed.
SDK capture failures log a constant message and cannot change the HTTP response.

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
4. Check event volume and retention after deployment. Prefer `route` for new
   endpoint charts and verify endpoint totals, 5xx rate and latency. For
   authenticated-account activity, filter `userType = user` and, if counting
   only interactive account activity, `authType = jwt`. Request telemetry
   cannot measure unique Collection users.

Do not paste captured payloads into an issue as review evidence. Record only
safe metadata, decisions and confirmation of completed remediation.
