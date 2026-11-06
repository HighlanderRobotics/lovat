# Cairn telemetry source snapshot

This is the producer SDK from `HighlanderRobotics/cairn`, pinned to merged commit `fd029d1c90b100fd31313e902b065effeaac8712` (SDK 0.1.0). `UPSTREAM.json` records the source files and SHA-256 checksums. The source is copied verbatim, including its request/diagnostic contracts; only local package/build metadata is adapted to Lovat's existing independent-app installation model.

The upstream package is private and unpublished. Keeping a reviewed source snapshot lets CI and Railway build without a cross-repository credential, root workspace, downloaded binary artifact, or committed generated JavaScript. Applications depend on it through `file:../../packages/cairn-telemetry`, like `@lovat/db`. Do not hand-edit snapshot source; update it from a reviewed upstream commit and refresh its checksum manifest together.

```sh
npm ci --include=dev
npm run build
```

The package owns its npm lockfile. Build output under `dist/` is ignored. Server's install/build scripts prepare this dependency. Worker CI and Docker builds prepare it before Bun copies local dependencies. For a clean local Worker setup, build this package and `@lovat/db` before `bun install`.

Only the producer request queue, redaction helpers, diagnostic exporters, and validation contracts are included. No database client, server ingestion code, Better Auth, or provider integrations are included. The Hono 4.13.16 version must match Worker types; Worker intentionally advances from 4.13.13 to this SDK-compatible patch. Zod 4.6.7 is private to the SDK and does not upgrade application validation dependencies.

Queues are memory-only and bounded by event count, not exact bytes. The middleware queues synchronously and exports asynchronously on the application event loop. Default request queues hold 2,000 waiting events plus one in-flight batch, with two-second flushes and health reports even when idle. The SDK supports a bounded shutdown budget and counts dropped/failed exports. A collector outage can lose observations but must not fail a request or alter worker job leases. No registry publication or real telemetry transmission occurs merely by installing the package.
