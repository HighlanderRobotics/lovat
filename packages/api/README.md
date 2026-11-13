# @lovat/api

Shared API definitions for Lovat. This package has its own npm lockfile and is consumed through local file dependencies. It does not import Prisma, read environment variables, start a server, or connect to external services.

## Consumers

- The existing Server consumes the extracted Collection report validator and legacy OpenAPI definitions.
- The replacement application in apps/api consumes the v3 contracts and typed client.
- Other TypeScript services can add a file dependency on this package and use createApiClient or inferred request/response types.
- Dashboard client generation and consumer migration are tracked by LVT-377. Existing Flutter bindings remain in use.

The root export contains report/event schemas, error schemas, metric metadata/results, v3 routes and createApiClient. The optional @lovat/api/legacy export contains the existing model-shaped wire schemas and createLegacyOpenApiDocument. Those legacy schemas describe the existing API; they are not a database model API. Some existing endpoints still have broad or incomplete documentation.

## Commands

Run npm ci, npm test, npm run lint, npm run format:check and npm run generate:check. Run npm run generate after changing contracts. Generated OpenAPI artifacts are checked in; compiled dist and dependencies are not.

OpenAPI 3.1 describes the replacement routes in openapi.json and the extracted documented legacy routes in openapi.legacy.json. Refinements such as required quantities on scoring-stop event tuples are enforced by runtime validation; not every cross-field refinement can be represented by JSON Schema.

## Compatibility

Event action/position indexes are a wire contract: never reorder them. Report extraction preserves existing validation, including permissive rating ranges. Tightening validation requires a coordinated producer/consumer change.

Version incompatible public payload changes. Shared contracts must not expose database clients, secrets or private internal models. New routes must declare input, output and authentication requirements. Keep formulas in the replacement server's metric registry; this package owns the public shapes.
