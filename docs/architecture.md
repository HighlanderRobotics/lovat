# Lovat architecture

## Responsibilities

- Collection captures match events and post-match observations, keeps reports offline, and uploads them.
- Server authenticates callers, validates and stores reports, imports event data, caches analysis, and exposes the API.
- Dashboard consumes the authenticated API for analysis, scouting management, predictions, and picklists.
- Website serves public pages and selected Slack, contact, verification, and operational routes.

- Learn serves static user guides for Dashboard and Collection.

## Primary data flow

Collection submits a report to Server. Server validates the event sequence and identity, writes durable rows to PostgreSQL, computes analysis, and caches reusable results in Redis. Dashboard reads the resulting API views. The Blue Alliance supplies external schedules and results.

## External services

The system integrates with PostgreSQL, Redis, Auth0, The Blue Alliance, Slack, Resend, PostHog, Railway, Netlify, and EAS. Credentials belong in local or provider-managed environments, never in Git.

## Cross-application contracts

Compatibility-sensitive contracts include report JSON and event tuples, HTTP routes and response shapes, authentication headers, deep links, application versions, and season-specific enums and metrics. Search all applications before changing one of these contracts and update every affected producer and consumer together.

## Season changes

Game-specific fields span Collection report and UI code, Server Prisma and analysis code, and Dashboard metrics and views. A season change is not complete until all three applications and stored-data compatibility have been reviewed.

## Data ownership

Reports are associated with the scouter's source team. Analysis may expose own-team, all-team, or selected-team views. Private scouting notes and strategy data require explicit tenant and source-team controls at every API and UI boundary.

## Repository boundaries

`packages/db` owns the Prisma schema, migration history, generated types, and PostgreSQL client. Server consumes `@lovat/db` through a local package dependency. The separate Support backend is its next intended consumer. Each service owns its own connection pool and authorization; sharing models does not grant access to another team’s records. Browser and mobile clients continue to use APIs. Applications must not import source files across `apps/*` boundaries. See [database setup and deployment](../packages/db/README.md).
