# Server upstream sync — 2026-09-12

Imported `HighlanderRobotics/lovat-server` main through `35d8195` (full source revision recorded below), using the frozen import `4aa68fd246b01859ad4e0fab3e544167f72f907f` as the base.

- Imported the `/version` endpoint and its Railway commit identifier.
- Imported cross-platform development/production scripts using `cross-env`.
- Imported upstream dependency updates and its lockfile, then reconciled the database dependencies with the shared package.
- Adapted weekly npm Dependabot configuration to monorepo package directories.
- Retained the shared Prisma 7.10.0 package, its generated-client configuration, migration history, and TypeScript pin. Upstream schema changes were generator formatting only; no model change was omitted.
- Kept the monorepo's deployment and CI configuration.

The shared database package no longer has a `postinstall` hook. npm can execute hooks on a linked local dependency before installing that package's own tools. The server's install hook explicitly installs the database package from its lockfile, then generates and builds it.

Source revision: `35d81950349de4f6ab1bb79003c88dfd97f6f38f`.

Validation: installed from a fresh temporary checkout without `node_modules`, generated clients, or build output; `npm ci`, server build, compilation checks, and lint passed (78 warnings, including the imported version handler's missing return annotation). Local PostgreSQL integration passed. HTTP smoke checks covered `/status`, `/version`, OpenAPI generation, and rejection of an unauthenticated API call; Redis set/get/delete passed against an isolated instance.
