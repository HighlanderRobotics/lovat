# Shared packages

- [`@lovat/db`](db): canonical Prisma schema, migration history, generated types, and PostgreSQL client. Server consumes it today; the separate Support backend will consume it when implemented.
- [`@cairn/telemetry`](cairn-telemetry): source-pinned private Cairn producer SDK consumed by Server and Worker. Includes reviewed upstream checksums and local build metadata; no registry/private-repository credentials or committed build output are required.

Each package owns its lockfile. Applications consume the built package through a local `file:` dependency, without cross-app source imports or a root workspace.
