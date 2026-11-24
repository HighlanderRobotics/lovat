# Database restore rehearsal

This drill covers the synthetic restore slice of
[LVT-346](https://linear.app/highlander-robotics/issue/LVT-346). It verifies that
an empty database can be restored from a logical backup of Lovat's schema and
related rows. It does not restore a Railway backup or affect any live service.

## Run an isolated rehearsal

Use the **Synthetic PostgreSQL restore** GitHub Actions workflow, which runs
on relevant pull requests and on manual dispatch, never production pushes.
Locally, use Node 22.20.0 and PostgreSQL 16 server and client tools
(`initdb`, `pg_ctl`, `createdb`, `psql`, `pg_dump`, `pg_restore`) on
`PATH` as a non-root user. The machine must allow local Unix sockets.

```sh
npm ci --prefix packages/db
node --test scripts/synthetic-db-restore.test.mjs
node scripts/synthetic-db-restore.mjs
```

The script takes no URL or archive arguments. It creates a private temporary
cluster with TCP disabled, an empty target, and synthetic source rows. It checks
a restored ScoutReport linked to its Event, Scouter and TeamMatchData; verifies
that a write made after the snapshot is absent; compares the applied migration
history and checks schema parity. It normally stops the temporary server and
removes the synthetic archive, which must not be uploaded or committed. If it
reports a cleanup error, inspect only the printed temporary directory and stop
its server before removing the directory.

Record the exact tested commit and JSON log. `dumpMs` and `restoreMs` measure
the dump and restore commands. `verifiedRestoreMs` includes validation after
restore begins. `snapshotAgeMs` is the elapsed time from just before this
synthetic dump to successful validation; the marker check only proves the
logical backup boundary. None of these is the production recovery point
objective (acceptable data loss) or recovery time objective (acceptable time
to resume service).

## Remaining release sign-off

- Verify the provider's actual backup retention, encryption, restore coverage
  and access in an approved operational rehearsal.
- Restore into an isolated, access-controlled environment. Verify representative
  report integrity and measure the time from selecting a recovery point until
  the application is serving checks on that restored copy. Measure data loss
  against known committed writes or durable markers. Do not copy production
  data into PR environments or CI artifacts.
- Rehearse rolling back the application without rolling back database
  migrations in place. Record the tested app revisions, migration compatibility,
  recovery objectives and responsible release operator before production sign-off.
