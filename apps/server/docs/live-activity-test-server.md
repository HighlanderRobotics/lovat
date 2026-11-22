# Isolated Live Activity test server

This runs the real Server application and Collection routes against a dedicated
local PostgreSQL cluster and Redis instance. It does not mock the API or use a
production database. Keep TBA, Nexus, email, Slack, and analytics credentials out
of this environment so synthetic data stays local.

The fixture tool refuses any database URL except host `127.0.0.1`, port `55439`,
database `live_activity_qa`. It seeds five complete six-team matches and one
scouting shift: Q27 is before the shift; Q28, Q29, P1, and F1 are assigned to the
test scout. Changing a match's canonical status exercises the same completion
fields read by the Live Activity API after a normal worker import.

## Setup

Use Server's pinned Node 22.20.0 and run `npm ci`. Create a fresh local cluster
using PostgreSQL 16 on port 55439, then create database `live_activity_qa`. Run
Redis on loopback port 56389. These services must be separate from existing
developer databases. Apply the committed migrations from `packages/db`:

```bash
DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:55439/live_activity_qa \
  npx prisma migrate deploy
```

Store configuration outside the repository in a directory readable only by your
user. A fixture JSON file has this shape (use a unique test team code):

```json
{
  "teamNumber": 99999,
  "teamCode": "your-unique-test-code",
  "scouterUuid": "9bc9a5bb-a79c-4864-ae62-733ac150335b",
  "tournamentKey": "2026liveactivityqa"
}
```

For an already configured phone, an operator may instead use its existing team,
scout UUID, and selected tournament key in this **local-only** fixture. That
avoids resetting the phone or touching queued scouting reports. Keep any real
team code private; do not commit the fixture or a phone settings backup.

An environment file outside the repository should contain:

```dotenv
DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:55439/live_activity_qa
REDIS_URL=redis://127.0.0.1:56389/0
REDIS_KEY_PREFIX=lovat:live-activity-qa:
PORT=43189
BASE_URL=http://YOUR_MAC_LAN_IP:43189
AUTH0_DOMAIN=lovat.us.auth0.com
NODE_ENV=development
LIVE_ACTIVITY_FIXTURE=/absolute/private/path/fixture.json
```

From `apps/server`, seed and start the server, replacing `/private/path/qa.env`:

```bash
node --env-file=/private/path/qa.env tools/live-activity-fixture.mjs seed
node --env-file=/private/path/qa.env node_modules/tsx/dist/cli.mjs src/server.ts
```

Connect Collection using its existing custom API URL deep link:
`lovat-collection://set-url?u=ENCODED_API_URL`, where the URL is the Mac's LAN
address and port 43189. The phone must be on the same network. If a cold deep-link
launch leaves a blank screen, relaunch Collection normally. Reset the custom URL
from Settings after testing to return to production.

Keep Collection open for foreground refresh checks. Debug should show **Real
scout assignments**, an active activity, and **sandbox** on a development-signed
device. The app refreshes assignments every minute while active; the explicit
refresh control provides a faster manual check.

## Advance synthetic matches

Run these from `apps/server` with the same environment file:

```bash
# Complete the earliest pending match: Q27 → Q28 → Q29 → P1 → F1.
node --env-file=/private/path/qa.env tools/live-activity-fixture.mjs advance
# Cancel the earliest pending match instead of completing it.
node --env-file=/private/path/qa.env tools/live-activity-fixture.mjs cancel
# Change the Q28 assigned team to 254 while Q28 is pending.
node --env-file=/private/path/qa.env tools/live-activity-fixture.mjs reassign
# Reset only the isolated fixture back to before shift.
node --env-file=/private/path/qa.env tools/live-activity-fixture.mjs seed
```

The real HTTP/database smoke test checks authorization, waiting/on-shift states,
assigned team changes, cancellation, qualifier/playoff/final labels, and null
state after all matches finish. It resets the fixture before and after running;
avoid running it simultaneously with manual phone checks.

```bash
node --env-file=/private/path/qa.env tools/test-live-activity-server.mjs
```

## What requires an Apple key

An installed iPhone can register its sandbox push-to-start and activity update
tokens without a provider signing key on Server. The server cannot send APNs
updates until `APNS_TEAM_ID`, `APNS_KEY_ID`, and `APNS_PRIVATE_KEY` are configured.
Without them, `backgroundReady` is false and the refresh worker skips delivery.
Successful foreground updates or token registration do not prove background
delivery. No fake APNs credential or alternate delivery mechanism is used here.

Store the real provider credentials only in the private environment file and
restart Server. The key must support the sandbox environment and Collection's
topic when testing a development-signed phone. Do not put the `.p8` file or its
contents in this repository. Match/assignment changes, starts, and endings use
APNs priority 10 for prompt delivery; unchanged three-minute heartbeats use
priority 5 to conserve the system's notification budget. Apple may still delay
delivery, so an APNs HTTP 200 must be checked against the actual device display.

With a sandbox-capable APNs key configured privately, repeat match advancement
while the phone is locked or Collection is closed, then verify the heartbeat,
schedule completion, and disable/unregister behavior. That is a separate gate
from these HTTP/database tests.
