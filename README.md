# Lovat

Lovat is Highlander Robotics Team 8033's scouting system for FIRST Robotics Competition events. It collects match observations, analyzes team performance, supports scouting operations, and presents data for match strategy and alliance selection.

## Applications

| Path | Purpose | Technology |
|---|---|---|
| [`apps/collection`](apps/collection) | Field-side match collection, offline history, and report upload | Expo, React Native, TypeScript |
| [`apps/server`](apps/server) | API, authentication, storage, imports, caching, and analysis | Node.js, Express, TypeScript, Prisma, PostgreSQL, Redis |
| [`apps/dashboard`](apps/dashboard) | Analysis, scouting management, predictions, and picklists | Flutter and Dart |
| [`apps/website`](apps/website) | Public site and selected operational routes | SvelteKit and TypeScript |

## Data flow

```text
Collection ── reports ──> Server <── schedules and results ── The Blue Alliance
                            │
                            ├── PostgreSQL: durable data
                            ├── Redis: analysis cache
                            └── authenticated API ──> Dashboard

Website provides public pages and selected operational integrations.
```

See [`docs/architecture.md`](docs/architecture.md) for boundaries and cross-application contracts.

## Prerequisites

- Server: Node.js 22.20.0, PostgreSQL, and Redis.
- Collection: Node.js 24.6.0 and Expo/EAS tooling.
- Dashboard: Flutter; CI versions are documented in its local instructions.
- Website: Node.js 20.19.6.
- macOS and Xcode are required for local iOS builds.

Each application retains its own lockfile. Install dependencies inside the application directory.

## Commands

```bash
./scripts/check-structure.sh
./scripts/check-all.sh
```

Application development commands:

```bash
cd apps/server && npm run dev
cd apps/collection && npm start
cd apps/dashboard && flutter run -d chrome
cd apps/website && npm run dev
```

Several applications require environment files or external services for full runtime behavior. Copy only committed `.env.example` files and never commit credentials.

## Working here

Read [`AGENTS.md`](AGENTS.md) and the nearest app-local `AGENTS.md` before editing. Keep changes within the app that owns the behavior. Update all affected producers and consumers together when a shared contract changes.

## Deployment

- Server: Railway, repository root `apps/server`.
- Dashboard: Netlify web deployment and GitHub Actions Android artifact.
- Collection: EAS, project root `apps/collection`.
- Website: Netlify, base directory `apps/website`.

## History

This repository combines four formerly separate repositories. Default-branch histories and namespaced release tags are retained. Original-to-rewritten maps and migration evidence are in [`docs/migration`](docs/migration); the source repositories remain the record for old pull requests and feature branches.
