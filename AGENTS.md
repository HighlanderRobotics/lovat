# Lovat agent instructions

## Scope

This repository contains four independently buildable applications under `apps/`. Root instructions apply everywhere. Read the nearest app-local `AGENTS.md` before editing an application.

## Repository map

- `apps/server`: Express, Prisma, PostgreSQL, and Redis service.
- `apps/dashboard`: Flutter analysis and scouting-management client.
- `apps/collection`: Expo and React Native scouting client.
- `apps/website`: SvelteKit public site and operational routes.
- `packages`: reserved; no shared runtime package exists.
- `docs`: architecture and migration evidence.
- `scripts`: repository coordination checks.

## Working rules

- Keep an application change inside its owning directory unless a contract requires coordinated consumers.
- Search all applications before changing reports, API shapes, authentication, deep links, versions, or season metrics.
- Do not create cross-app relative imports or a root package workspace without an approved design.
- Preserve each app's package manager and lockfile. Do not upgrade dependencies incidentally.
- Never commit credentials, private `.env` files, signing assets, database dumps, production data, generated dependencies, or build output.
- Treat scouting notes and team strategy as sensitive. Preserve tenant and source-team filters.
- Never run a destructive database command against an unverified database URL.
- Use atomic, imperative commits without `Co-Authored-By` lines.
- Run the nearest app checks before completion and report pre-existing failures separately.

## Common checks

```bash
./scripts/check-structure.sh
./scripts/check-all.sh
```

The aggregate script assumes app dependencies are already installed and intentionally exposes documented baseline failures.

## Current limitations

- Server tests compile TypeScript but do not provide behavioral coverage.
- Collection Android and web have tracked pre-existing issues.
- Dashboard analysis has one baseline informational failure and little test coverage.
- Website check and formatting commands fail at the migration baseline; production build needs private environment configuration.
