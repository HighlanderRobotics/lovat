# Adding Dashboard features

The rewrite uses Svelte 5, TypeScript, Magnolia UI v2, SvelteKit/Vite, and Tauri 2.
The interactive mock and authenticated client have separate state and persistence.
Mock behavior does not imply a server endpoint or change Flutter's contracts.

## Ownership

```text
src/lib/
  app/
    DashboardApp.svelte       browser lifecycle, readiness, persistent docks
    routing/routes.ts        typed route names, canonical paths, parents, tabs
    routing/history.ts       history reuse and navbar direction
    actions.ts               typed action union, context, dispatcher
    screens.ts               native feature-page registry
    session.svelte.ts        composes feature stores and shared selection state
  features/
    questions/               draft model, validation, editor, store, actions
    forms/                   form kind, tabs, form-level actions
    assignments/             team model, drag/drop, scouter picker, store, actions
    api-keys/                record model, table, selection, mutations, actions
    members/                 active member, promotion state and actions
    settings/                source summaries and apply action
    scouting/                match filters and filter controls
  shared/
    components/              general input components
    forms/                   submission lifecycle and notices
    loading/                 asset readiness, splash, skeletons, retry
  design/                    reference fixtures and compatibility adapters only
```

Feature components receive their own store or explicit props/callbacks. Stores
own mutations; actions coordinate navigation and submissions. The application
session composes stores rather than duplicating their data. Shared selection
and field bindings allow the reference renderer to retain edits across related
prototype states. Add new domain state to its feature store rather than the
session or the recursive renderer.

## Routes and actions

Use `RouteName` and `routePath` from `app/routing/routes.ts`. For example,
`forms.questions` resolves to `/dashboard/forms/questions`, and `apiKeys.list`
resolves to `/dashboard/api-keys`. Parents, selection scopes, search variants,
form tabs, and navbar ownership are registered centrally. Browser history stores
route names. Modal actions replace the current entry and preserve their origin;
form tabs replace the entry; Back restores the previous page; revisiting a page
reuses its existing entry. Navbar motion follows the declared tab order.

Use typed actions for behavior, not button text or source node IDs:

```ts
onaction({ type: 'questions.create' });
onaction({ type: 'forms.tab', tab: 'Responses' });
onaction({ type: 'navigation.open', route: 'members.list' });
```

Each feature exports an action union and handler from its `actions.ts`.
`app/actions.ts` combines them and provides a narrow context: the session,
current route, modal origin, navigation, notices, and validated submission.
Views need not know browser-history details. Mutation rules belong in the
feature's store or pure model. `Submission.run` validates before saving,
prevents duplicate saves, retains drafts on failure, and supports retry.

## Add a feature

1. Create `features/<feature>/model.ts`, `store.svelte.ts`, its page/component,
   and `actions.ts` as needed. Reuse Magnolia v2 controls and shared submission
   and loading components. Keep domain parsing/validation pure when possible.
2. Add its named route and definition to `app/routing/routes.ts`. Set a canonical
   `/dashboard/...` path and a sensible parent. Add selection scope, `viewOf`,
   `formTab`, or navbar `tab` metadata only when applicable.
3. Register a Svelte page in `app/screens.ts`. Its props are `FeaturePageProps`:
   `session`, `route`, and `onaction`. Native pages need no Figma ID, manifest,
   scene JSON, or renderer flags. `QuestionPage.svelte` is a working example.
   A conditional `when` supports migrating one reference view at a time. An
   optional `preload` can prepare a new native page before it is revealed.
4. Add the feature's action union/handler to `app/actions.ts`. Dispatch actions
   from the view. Put API persistence behind a service callback using the
   existing authenticated client; keep mock mutations explicitly local.
5. Add tests for meaningful domain rules and a browser journey using canonical
   paths and accessible controls. Check Back/cancel, invalid input, failed saves,
   and loading when they apply. Run the checks below, fetch the shared branch,
   and merge other contributors' changes before pushing without force.

## Figma adapter boundary

`design/frame-map.json` is the only route-to-frame map. `references.ts` resolves
legacy aliases and `/design/5775-...` review links into named routes. Those links
and `data-frame`/`data-figma-node` attributes remain for visual QA. Internal
navigation emits canonical paths. The 104 reference states include dialogs and
success variants; they are not 104 independent product features.

`design/behaviors.ts` annotates source geometry and controls;
`design/runtime.svelte.ts` hydrates the fixtures into feature-owned state;
`design/actions.ts` translates reference component names/labels into typed
product actions. Figma-specific node matching stays here. New native features
must not add source IDs or import `design/` modules. Reference fixture extraction
for API keys and assignments also stays in this boundary; their feature models
do not depend on the source tree.

## Verification

```sh
npm run format:rewrite:check
npm run check
npm test
npm run build
npm run test:e2e
```

`npm run format:rewrite` applies the pinned Prettier/Svelte formatter to the
rewrite modules and this guide. It excludes immutable scene JSON, generated
native output, and the unrelated authenticated client. The Tauri web CI job runs
formatting, type checks, unit tests, the ordinary web build, and mock browser
journeys. No Rust code changed in this refactor.

Unit checks enforce unique canonical paths, valid parents, reference-link
compatibility, and no Figma IDs in application/feature/shared code. Browser
coverage retains every reference state and checks selections, editing, dialogs,
Back, motion, loading, mobile geometry, and named-route journeys. Native iPhone
keyboard appearance still needs a device check; Chromium cannot prove it.

## Current limits

The rewrite now has a feature-first structure, typed routes/actions, independent
feature stores, a native-page extension path, and automated boundaries. This
makes adding a feature substantially more predictable. The remaining legacy
coupling is concentrated in the reference adapter: raw style strings, source
labels, and optional renderer flags still serve existing Figma fixtures. Migrate
those views to registered native components as features become API-backed.

Mock stores are session-local and reset on reload. API-backed state and durable
persistence remain separate work. Existing `api/`, `auth/`, `models/`, and
`components/` still support the authenticated client and have not been migrated
by this change. The monorepo retains multiple app frameworks and toolchains.

The root structure checker can report nested `.git` directories inside ignored
Tauri `target/**/swift-rs/**/checkouts` dependencies after native builds. These
are generated checkouts, not tracked nested apps; this refactor does not remove
them or change that repository-wide checker.
