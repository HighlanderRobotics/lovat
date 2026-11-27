# Figma preview screens

These 91 screen states reproduce the visible 393px Dashboard frames on the
`For Implementation` page in [Lovat 2027](https://www.figma.com/design/aFsGTC9XlSZIO6HEQA1Zyz/Lovat-2027?node-id=5775-3878).

`manifest.json` connects each screen to its Figma node ID. `scenes/` holds the
translated Svelte view data, including nested flex/grid layouts, typography,
spacing, and asset slots. These are DOM views, not screenshots. Each state loads
as its own chunk. `DesignNode.svelte` supplies editable inputs, keyboard actions,
Magnolia buttons, and selection behavior. `actions.ts` connects the reference
states into mock journeys. `assets.json` records local image call sites.

Open `/design` for the complete catalog, or click the Lovat title on Home. Escape
also opens the catalog. The primary flows include Home, search, Forms, templates,
question types/options, coverage, assignments/shifts, Settings, members, sources,
API keys, export, rankings, match schedule, and alliances. Right-click a question
card to open its selection menu.

The mock is a design review tool. Confirmation buttons navigate to the reference
success state; they do not modify server data. Selections and input edits are held in memory for the mock session and reset
when the app reloads. New Forms and API-key mock views do not imply new server endpoints.
The ordinary app build keeps its existing Auth0 and API implementation.

Figma asset downloads and reference screenshots are kept out of the app's
runtime. Every runtime asset is in `static/design-assets`; no temporary Figma
URLs or screenshot images are used as pages. Borders are drawn without changing
Figma's layout box, and coverage grids use centered half-pixel stroke coverage.

## Build

`npm run build:mock` creates the static mock in `build/`. For native builds, pass
`--config src-tauri/tauri.mock.conf.json`; this uses the same native app and bundle
identifier as the branch, with the mock frontend. Do not upload a mock build as a
production release.

## Mobile layout and motion

Runtime screens fill the usable viewport and respect iOS safe areas. Opening
the keyboard preserves the screen height, reduces the scrolling region, hides
bottom controls, and scrolls the focused field into view. Dismissing it restores
the bottom controls. `layouts.json` identifies headers, scrolling bodies, bottom actions,
and tab bars; their positions stay independent of the reference frame height.
`tool/audit-design-layout.cjs` regenerates this metadata against a mock build
served on port 1430. Add `?reference=1` to retain the original Figma dimensions
for visual comparisons, including the Forms status-bar placeholder.

Navigation preloads the destination and lightly animates incoming content. The
header and bottom controls remain visible; full-screen View Transitions were
removed because their separate snapshots caused flicker on the phone. Choosing
a value in place does not navigate or remount the screen. Reduced-motion
preferences disable the content animation. Mobile viewport and gesture handling keep the app at 1x zoom while
allowing ordinary scrolling; mobile inputs use a 16px font to prevent focus zoom.


## Interaction state and review context

The implementation lives on `theodoreei/dashboard-tauri-svelte` in
`apps/dashboard-tauri`; it uses Svelte 5, TypeScript, SvelteKit/Vite, Magnolia UI
v2, and Tauri 2/Rust. The earlier `apps/dashboard-next` experiment belongs to a
separate worktree and is not the app being built here. The Figma file supplies
91 reference states, including dialogs and success messages rather than 91
independent destinations.

`runtime.svelte.ts` adapts the reference data into interactive controls:

- The active tournament is a single radio selection. Tournament and team sources
  allow multiple checkbox selections, including Select all and the current-only
  shortcuts. Applying selections updates the Settings summary for this session.
- Magnolia Checkbox, Radio, and Switch components provide native input behavior,
  keyboard support, checked state, and accessible labels. Selection keys span
  related reference/search states; row highlights do not substitute for values.
- Search hints are placeholders, not initial input values. Queries filter the
  mock list. Existing names and edited question text remain editable values.
- A question type changes the selected card on the Type tab. Options explicitly
  opens that type's options screen. Required is a working switch.
- Success toasts fade during their final 200ms and dismiss after 1.5 seconds without leaving the current screen.
  Confirmation dialogs continue to require their explicit action.
- The Forms header, search field, scrolling list, and bottom navigation occupy
  separate regions. Its decorative Figma status bar is hidden at runtime.

This is still a local UI mock: it does not save new forms, assignments, API keys,
selector preferences, or edits to the server. Repeated tournament/team labels
come from the reference fixture, not a live lookup. The ordinary authenticated
app and Flutter app retain their existing server behavior. When connecting these
screens to the API, replace the fixture adapters with application state and keep
the semantic input/selection behavior and mobile regression tests.

Run `npm run check`, `npm test`, `npm run build`, and `npm run test:e2e` before
shipping frontend changes. Browser coverage includes all reference states,
selection persistence and bulk changes, empty search fields and filtering,
question type/options separation, switches, toast timing, keyboard geometry,
mobile zoom, anchored controls, and reduced motion. Browser keyboard geometry is
simulated; verify actual keyboard presentation on the target iPhone as well.

The local iPhone build uses the existing bundle ID
`com.frc8033.lovatdashboard` and development signing. Cable installation is
separate from TestFlight: TestFlight still needs an available build number and
an App Store distribution export. No TestFlight upload has been performed.


## Mobile interaction refinements

`behaviors.ts` annotates translated nodes for rating steppers, real navigation
back actions, collapsible Coverage/Schedule headings, schedule status pills,
swipe option rows, and modal surfaces. Keep these behaviors separate from the
reference JSON. `?reference=1` loads the unmodified reference scene; the runtime
adapter supplies the interactive layout.

Back uses SvelteKit history state to return to the actual preceding route,
including browser back gestures. It restores each screen's body scroll and
retains the session's field values. Internal API-key selection state changes
replace the current history entry, so Back does not replay each checkbox click.
Cancel returns to the previous screen when a dialog was opened through the app.

Rating minimum/maximum controls update independent values and cannot cross one
another. Assignment labels retain their row's flexible sizing and a common
right edge. The layout adapter must not replace inline flex columns with
vertical page-flow sizing.

Schedule status pills filter the fixture rows; Coverage and Schedule headers
hide or restore their own content. Match-level tags can be removed or selected
from their menu. Match cards use 16px outer gutters. Option rows reveal Delete
with a horizontal swipe, then remove the option in place. A keyboard-accessible
Show delete action provides the same operation without a pointer gesture.

Dialogs are placed above a dedicated blurred backdrop. The background blocks
pointer input and the dialog foreground remains sharp. Modal positioning also
accounts for the on-screen keyboard. Checkboxes paint hover/selection across
their entire card, while compact API-key checkboxes limit feedback to their
20px control. Switch rows use the full row as their hover target.

On the shared `theodoreei/dashboard-tauri-svelte` branch, fetch before each
verified batch, integrate remote commits, and push without force. Build output,
signing material, and device artifacts remain untracked. These refinements are
mock behavior only and do not change the production Flutter/API contracts.
