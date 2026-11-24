# Local development and contributions

[Developer docs](../README.md) · [App directory](../../README.md#applications) · [Repository instructions](../../AGENTS.md)

## Run one app

Choose an app and follow its README for install commands, environment variables, and app-specific checks. Work from its directory; there is no root package install.

| App | Local prerequisites | Start from the app directory |
| --- | --- | --- |
| [Server](../../apps/server/README.md) | Node.js 22.20.0, PostgreSQL, Redis | `npm run dev` |
| [Worker](../../apps/worker/README.md) | Bun 1.3.14, supported Node.js for the DB build, PostgreSQL, a TBA key | `bun run start` |
| [Collection](../../apps/collection/README.md) | Node.js 24.6.0, Expo tooling, and a supported device or simulator | `npm start` |
| [Dashboard](../../apps/dashboard/README.md) | Flutter 3.41.0 and Chrome for web | `flutter run -d chrome` |
| [Website](../../apps/website/README.md) | Node.js as pinned in [`.nvmrc`](../../apps/website/.nvmrc) | `npm run dev` |
| [Learn](../../apps/learn/README.md) | Node.js 22 and npm | `npm run dev` |

Copy committed `.env.example` files as directed by each app's README. Use disposable services for testing and never commit credentials. The Worker starts importing data into the database you configure, so verify your target before running it. See the [shared database setup](../../packages/db/README.md) for migrations.

## Open a pull request

- Start from current `main` and follow [AGENTS.md](../../AGENTS.md) for branch names, commits, and Linear updates.
- Keep changes within the app that owns the behavior. When a shared contract changes, update and test affected producers and consumers together.
- Run the checks in the app README and follow the [testing guide](../testing/README.md). State what passed and what you did not run in the PR.
- See [review guidance](../../CODE_REVIEW.md) and the [OpenRouter reviewer README](../../tools/pr-reviewer/README.md) for automated review behavior, setup, and limits.

## Connect Linear in Codex

The project configures Linear as a project-scoped MCP server. After trusting this checkout in Codex, run:

```bash
codex mcp login linear
codex mcp get linear
```

Authentication is per user and is not committed. Restart an existing session after signing in; use `/mcp` in an interactive session to check the connection.
