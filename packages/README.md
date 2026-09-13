# Shared packages

- [`@lovat/db`](db): canonical Prisma schema, migration history, generated types, and PostgreSQL client. Server consumes it today; the separate Support backend will consume it when implemented.

Each package owns its lockfile. Applications consume the built package through a local `file:` dependency, without cross-app source imports or a root workspace.
