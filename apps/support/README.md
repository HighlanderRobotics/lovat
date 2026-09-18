# Lovat Support

Bun/Hono service for signed support-ticket requests, using `packages/db`.

## Local development

From the repository root:

```sh
npm --prefix packages/db ci
npm --prefix packages/db run build
cd apps/support
bun install --frozen-lockfile
# Set DATABASE_URL and LOVAT_SIGNING_KEY in your local .env.
bun run dev
```

`bun run build` checks TypeScript. `bun run start` runs the service. It listens
on `0.0.0.0` and `PORT` (default `3000`). `GET /status` is a public liveness
check; ticket routes under `/v1/tickets` require signed requests.

## Railway

Create a separate service from this repository:

| Setting | Value |
| --- | --- |
| Branch | `jackshim415/support` |
| Root Directory | `/` (repository root, required for the shared DB package) |
| Config File | `/apps/support/railway.json` |
| Dockerfile | `apps/support/Dockerfile` (set by the config) |

Remove any inherited build/start command overrides from the Server service.
The Dockerfile builds Prisma and the shared package before installing and
checking Support. Its dedicated ignore file excludes local secrets and build
artifacts while including Support, which the root Server ignore file excludes.

Set these service variables:

- `DATABASE_URL`: reference the existing Lovat PostgreSQL service's private
  connection URL, for example `${{Postgres.DATABASE_URL}}` (use your service name).
  Support shares the Server database; do not create an unrelated empty database.
- `LOVAT_SIGNING_KEY`: the same secret used by the Website and Server.
- Railway supplies `PORT` automatically. No secrets are required at build time.

The pre-deploy command applies the shared Prisma migrations before starting the
new deployment. Use the same database and migration history as Server. The
`/status` healthcheck confirms HTTP availability, not database connectivity.

Generate a public domain for Support and set the Website's `LOVAT_SUPPORT_BASE`
to its HTTPS origin with no trailing slash, then redeploy Website. Keep
`LOVAT_API_BASE` pointing to Server. Verify `GET /status` returns 200, unsigned
ticket requests return 401, and a contact-form submission creates a ticket.

To build the same image locally (Docker must be running):

```sh
docker build -f apps/support/Dockerfile -t lovat-support .
docker run --rm --env-file apps/support/.env -e PORT=3000 -p 3000:3000 lovat-support
```

See Railway's [monorepo guide](https://docs.railway.com/deployments/monorepo)
and [healthcheck documentation](https://docs.railway.com/deployments/healthchecks).
