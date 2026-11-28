# Adding Dashboard features

The rewrite uses Svelte 5, TypeScript, Magnolia UI v2, SvelteKit/Vite, and Tauri.
The authenticated client and the Figma mock currently share a shell but have
separate state and persistence paths. Mock state does not imply a server feature.

## Current organization

- `src/lib/api`: authenticated transport, endpoints, query/cache behavior.
- `src/lib/models`: domain parsing and transformations.
- `src/lib/components`: reusable UI for the authenticated Dashboard.
- `src/routes`: product routes.
- `src/lib/design/scenes`: immutable reference fixtures translated from Figma.
- `src/lib/design/behaviors.ts`, `actions.ts`, and `runtime.svelte.ts`: legacy
  reference-node adapters, navigation targets, and mock session state.
- `src/lib/design/QuestionEditor.svelte` and `questions.ts`: a typed feature
  component and its blank draft factory, validation, and subtitle rules.
- `src/lib/design/submission.svelte.ts`: shared idle/pending/invalid/failed/success
  lifecycle, with feature-owned validation and persistence callbacks.
- `src/lib/design/sceneAssets.ts` and `LoadingView.svelte`: shared page readiness,
  Figma splash artwork, skeletons, and retryable loading errors.

## Preferred extension pattern

1. Put a feature's data type, defaults, and validation in its own module. Keep
   Figma node IDs out of domain rules. Use `questions.ts` as a small example.
2. Put its view in a component that accepts state and callbacks. Reuse Magnolia
   controls, spacing, errors, and accessible labels instead of copying fields.
3. Keep persistence behind a service callback. Use the existing API client for
   authenticated features; replace `submitMock` when connecting the mock editor.
4. Use `Submission.run` for validation and async saves. Preserve drafts after
   failure, prevent duplicate saves, and offer retry. Do not show success before
   the persistence callback succeeds.
5. Register navigation once, preserve Back behavior, and load required assets
   before revealing the destination. Put initial loading behind the existing
   Figma splash and later cold loading behind a skeleton.
6. Test domain boundaries with Vitest and the user journey with Playwright.
   Run `npm run check`, `npm test`, `npm run build`, and `npm run test:e2e`.

## Standardization assessment

The repository has clear application ownership, local agent instructions,
committed lockfiles, shared database ownership, contract documentation, and
app-specific CI. The Dashboard has centralized API access and reusable controls.
These are useful foundations for adding features without changing other apps.

The Figma mock is less standardized than the authenticated client. Several
central adapter files still combine unrelated feature behavior and branch on
numeric Figma IDs. `DesignNode` has many optional flags, raw style strings, and
prototype labels as action identifiers. That makes a visual change capable of
breaking another flow and encourages repeated special cases. New features
should follow the typed component/service pattern above rather than expand
those switches. The new question editor demonstrates that separation while
preserving the existing reference catalog.

Next priorities for feature work are a named screen/action registry, migration
of forms/members/assignments into separate feature modules, API-backed stores
with shared error handling, and browser journeys in CI. The Tauri workflow
currently runs Svelte checks, unit tests, a web build, and a native compile;
Playwright coverage is currently run locally rather than by that workflow.
Different app frameworks use different toolchains, so repository consistency
is strongest in ownership and contracts, not in a single build or UI framework.

The repository structure check currently reports nested `.git` directories in
ignored Tauri `target/**/swift-rs/**/checkouts` build dependencies. Those are
not nested application repositories or tracked source. Its directory traversal
needs to ignore generated native output before it is a reliable local gate
after iOS builds. No generated checkouts were removed or committed.

The Tauri package does not currently pin a formatter/linter or expose matching
CI scripts. A small app-local formatting/linting policy would improve review
consistency; this change does not add a repository-wide toolchain or dependencies.
