# Lovat agent instructions

## Scope

This repository contains independently buildable applications under `apps/`. Root instructions apply everywhere. Read the nearest app-local `AGENTS.md` before editing an application.

Repository-wide workflow rules belong in this root file. Nested `AGENTS.md` files should contain only application-specific instructions and must not duplicate this workflow guidance.

## Repository map

- `apps/server`: Express, Prisma, PostgreSQL, and Redis service.
- `apps/dashboard`: Flutter analysis and scouting-management client.
- `apps/collection`: Expo and React Native scouting client.
- `apps/website`: SvelteKit public site and operational routes.
- `apps/learn`: Astro/Starlight user guides for Dashboard and Collection.
- `packages/db`: shared Prisma schema, migrations, generated types, and PostgreSQL client; consumed by Server and intended for the separate Support backend.
- `docs`: architecture and migration evidence.
- `scripts`: repository coordination checks.

## Development workflow

### Branches

- Do all feature work on a branch. Start from the latest default branch unless the user requests another base.
- Keep unrelated work out of the branch. Preserve existing uncommitted changes and never include them in a commit or PR without the user's approval.
- For Linear work, name branches `<user>/<ticket-id>-<short-slug>`, using lowercase words separated by hyphens, for example `ben/lvt-227-remove-unsafe-redis-flushing`.
- When no Linear ticket applies, use `<user>/<short-description>`. Do not invent a ticket reference.

### Commits

- Follow the [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/) using the form `type(scope): description` when a scope is useful.
- Add the Linear identifier in a commit footer when applicable, for example `Refs: LVT-227`.
- Keep commits atomic and use imperative descriptions. Do not include `Co-Authored-By` lines.
- On long-running tasks, commit whenever a substantive step is complete. Do not wait until the entire task is finished to commit working milestones.

### Linear

- Keep applicable Linear tickets current throughout the work using the Linear MCP tools. Do not use browser automation for Linear updates.
- Move the ticket to an active state when work begins. Add the branch or implementation context when it helps other contributors understand the current state.
- When a PR opens, attach it to the ticket and add the implementation summary, exact verification results, known failures, and review status.
- Move the ticket to Done only after the change merges. If the team's workflow has no exact matching state, use the closest state and explain the choice in a comment.

### Pull requests and merging

- Open a PR when the implementation, relevant checks, and self-review are complete.
- Link the Linear issue when applicable. Include the exact verification commands and separate pre-existing failures from regressions.
- Do not merge a PR unless the user explicitly requests it.
- When asked to merge a branch with many interim commits, prefer squash merge so the default branch receives one coherent Conventional Commit.

## Working rules

- Keep an application change inside its owning directory unless a contract requires coordinated consumers.
- Search all applications before changing reports, API shapes, authentication, deep links, versions, or season metrics.
- Do not create cross-app relative imports or a root package workspace without an approved design.
- Preserve each app's package manager and lockfile. Do not upgrade dependencies incidentally.
- Never commit credentials, private `.env` files, signing assets, database dumps, production data, generated dependencies, or build output.
- Treat scouting notes and team strategy as sensitive. Preserve tenant and source-team filters.
- Never run a destructive database command against an unverified database URL.
- Run the nearest app checks before completion and report pre-existing failures separately.

## Commit messages and pull request descriptions

Write for student contributors who may be unfamiliar with the affected code or the discussion that led to the change. Give them enough context to understand the goal and learn from the implementation without turning the description into a tutorial.

- **Commit messages:** Use a short, imperative subject that names the specific change and its purpose where practical. Add a brief body when the reason or a tradeoff would otherwise be unclear. Avoid vague subjects such as "Fix issues" and lists of edited filenames.
- **PR titles and summaries:** Lead with the problem or goal, then explain the resulting behavior and who benefits. Describe the final change so the PR makes sense without the chat history or linked issue. A list of implementation steps alone is not a summary.
- **Teaching context:** Explain why a non-obvious implementation choice solves the problem. Define unfamiliar terms when needed, and use a concrete before/after example when it makes the behavior easier to understand. Assume intelligence, but not prior project knowledge; skip textbook explanations and details already obvious in the diff.
- **Length and structure:** For a small PR, aim for one or two short paragraphs plus verification. Follow the repository PR template, keeping its sections brief. Add detail only for meaningful complexity, risks, or decisions a reviewer needs to assess.
- **Verification:** State what was checked and the result. Distinguish automated checks from manual testing, and disclose skipped checks and their reasons. Do not imply that compilation or formatting checks prove the feature works.

For example, a layout-fix summary could read: "Long match labels can overflow the Dashboard's breakdown details, making scouting information hard to read. This change lets row labels wrap within the available width and shortens oversized page titles with an ellipsis. Constraining the text width gives Flutter a boundary at which to wrap or truncate it."

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
