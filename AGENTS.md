# Lovat agent instructions

## Scope

This repository contains independently buildable applications under `apps/`. Root instructions apply everywhere. Read the nearest app-local `AGENTS.md` before editing an application.

## Repository map

- `apps/server`: Express, Prisma, PostgreSQL, and Redis service.
- `apps/dashboard`: Flutter analysis and scouting-management client.
- `apps/collection`: Expo and React Native scouting client.
- `apps/website`: SvelteKit public site and operational routes.
- `apps/learn`: Astro/Starlight user guides for Dashboard and Collection.
- `packages/db`: shared Prisma schema, migrations, generated types, and PostgreSQL client; consumed by Server and intended for the separate Support backend.
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
