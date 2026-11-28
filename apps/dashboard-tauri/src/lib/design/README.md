# Figma preview screens

These 104 screen states reproduce the visible 393px Dashboard frames on the
`For Implementation` page in [Lovat 2027](https://www.figma.com/design/aFsGTC9XlSZIO6HEQA1Zyz/Lovat-2027?node-id=5775-3878).

`manifest.json` connects each screen to its Figma node ID. `scenes/` holds the
translated Svelte view data, including nested flex/grid layouts, typography,
spacing, and asset slots. These are DOM views, not screenshots. Each state loads
as its own chunk. `DesignNode.svelte` supplies editable inputs, keyboard actions,
Magnolia buttons, and selection behavior. `actions.ts` translates reference controls into typed feature actions.
Named route definitions and history live in `../app/routing`, and feature-owned
state and handlers live in `../features`. `assets.json` records local image call sites.

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

Navigation preloads the destination and uses a fast 170ms horizontal page swipe.
`../app/routing/pageMotion.ts` animates the incoming content and an inert outgoing content copy;
Back reverses the direction. `presentation.ts` extracts bottom actions and the
navbar into a persistent dock, so those controls are neither remounted nor
animated with the page. Reduced-motion preferences skip the swipe.
Mobile viewport and gesture handling keep the app at 1x zoom while
allowing ordinary scrolling; mobile inputs use a 16px font to prevent focus zoom.


## Interaction state and review context

The implementation lives on `theodoreei/dashboard-tauri-svelte` in
`apps/dashboard-tauri`; it uses Svelte 5, TypeScript, SvelteKit/Vite, Magnolia UI
v2, and Tauri 2/Rust. The earlier `apps/dashboard-next` experiment belongs to a
separate worktree and is not the app being built here. The Figma file supplies
104 reference states, including dialogs and success messages rather than 104
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
including browser back gestures. Top tabs, ranking segments, and search views
replace the current entry, so Back skips those view changes. It restores each screen's body scroll and
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


## Navigation and search follow-up

The three form tabs share one page-history entry. Responses currently shows the
fixture response count; response-detail API integration is still pending. The
question Type/Options tabs also share one entry. Draft values and per-screen
scroll positions remain in session state when returning to a page.

Search filters rows rather than nested controls. Live inputs use flexible input
sizing instead of copying fixed Figma text-layer sizing. Closing search clears
its filter while retaining checkbox/radio values. This avoids leaving hidden
rows behind after dismissing the search bar.

Profile bars use equal 44px Back/Edit controls on a transparent background, with
the gradient visible behind them. Promote Analysts is exposed on Members and
Manage Team, not the Settings homepage. New tests check history across all form
tabs, dock element identity, frame-by-frame Save-button visibility, search
restoration, and profile control alignment.

Search now opens in the current top bar rather than switching to another Figma
fixture route. Rank/search icons remain above the header background. Checkbox
search filters the complete row wrapper, so hidden grid wrappers do not leave
empty gaps. The query clears on close and selections remain independent.

Modal routes replace the current browser entry and retain `designReturn` for
their origin. Their background is composed from the live origin presentation;
confirmation and dismissal replace the modal entry, so Back cannot replay a
completed dialog. Modal surfaces ignore page-body layout anchors and clear
Figma translation properties before centering within the usable viewport.

## Assignment and option interactions

`TeamAssignments.svelte` renders the team fixture as a stateful assignment board.
Teams move between scouters and Unassigned using HTML drag-and-drop, pointer
handles (including touch), or an accessible assignment selector. Counts update
from the actual board state. Autoassign distributes the same session data among
selected scouters, respecting the maximum-per-person field.

`ScouterPicker.svelte` starts closed and opens only through its arrow. Input
focus does not reveal the option list. This replaces the permanently expanded
listbox in the Figma autoassign snapshot.

Swipe rows are adapted per option card, never by replacing a shared question
container. Multiple-select retains its title, Required switch, selection-limit
steppers, and all five reference choices. Editing an option uses the same modal
surface with the current option value and returns to its originating type.
These are local interactions; assignment and option persistence still requires
server integration.

API-key rows now use `ApiKeysTable.svelte` with stable session record IDs rather
than navigating between selected-row snapshots. Create, rename, delete, search,
and the toolbar operate on that same local record list, including a newly
created fourth key. Selection counts remain correct when names or row positions
change. The generated key shown by the mock remains fixture content; this does
not provision real server credentials. Modal backgrounds and docks are inert so
a search input behind a dialog cannot steal focus or reopen the keyboard.

## Added response and preview screens

The refreshed Figma set uses `5787` IDs. Thirteen new states cover the three
response lists, their detail views, form settings/deletion, and five interactive
question previews. Legacy `/design/<frame>` review links remain usable; internal navigation uses
canonical `/dashboard/...` paths and typed route names. Responses tabs replace the current form
history entry; response details push an entry. Form settings actions stay docked
above the bottom safe area. Preview cards use the same blurred modal layer and
return to the live editor on backdrop click or Back.

Promotion updates local member roles and removes promoted users from the
analyst picker. Add scouter opens an independent picker and creates a drop zone;
it no longer invokes Autoassign. Assignment zones display a landing placeholder
and animate open/closed while a team hovers. Multiple-select option editing uses
an empty Hint field. Type icons use the supplied Figma assets as masks and take the selected
accent colour. These mutations are session-only mock behavior.

The native main window is constructed from the existing Tauri window config.
On iOS its accessory-view builder returns `None`, removing the accessory strip
above the software keyboard. Frontend keyboard geometry subtracts the frame’s bottom safe-area reservation
from the keyboard inset, preventing a second blank strip above the keyboard. Actual iPhone keyboard
appearance still requires a device check; Chromium viewport tests cannot prove
native keyboard rendering.

## Selection, question hints, and navigation refinements

Selection actions switch between Select all and Deselect all from the complete
selection state, including while filtering. Promotion actions use a centered
15px medium label and primary foreground colour for every selected count.

Question option names and hints have stable per-type keys. The edit dialog
loads both values and saves them back to the option row and its preview. Single
and multiple-select editors also provide a separate question hint. Preview
headings show that hint and an Optional subtitle when Required is off. Required
state belongs to each question type rather than leaking between all five demo
questions.

Form settings uses the same 26px gutters as the other screens. Its Target
selector is disabled because an existing form’s target cannot be changed.
Assignment drag previews render the same card snippet, width, height, logo,
text, and colours as their source card, with hover landing feedback retained.

`../app/routing/history.ts` derives navbar animation direction from tab order and finds
existing browser entries before pushing a destination. Revisiting a page
traverses to its existing entry, so Back does not replay A → B → A loops; a
navbar traversal retains the direction of the clicked tab. Screens opened as a
main tab retain the navbar even when their reference scene is also used as a
standalone detail page. Browser Back and
Forward still use their own traversal direction.

The navbar occupies its visible 52px height. Home uses a flexible banner and
smaller bottom padding to fit its matches and teams above the bar. Its content
region does not scroll, while other pages retain independent scrolling bodies.

## Loading and form-state boundaries

The splash is the existing Figma `Splash` frame `1864:486`, rendered from its
unmodified local SVG export (`166a7.svg`). `../shared/loading/sceneAssets.ts` awaits required image
loads/decodes and fonts before a destination becomes visible. Cold navigation
shows a skeleton; asset failures show a retryable error instead of partial UI.

Optional preview subtitles use `Type · Optional`; required previews show the
type alone. Form-list type descriptions remain compact. Responses use standard
26px content gutters and zero-offset headers. Add scouter includes a search
input for available people.

New-question creation uses `../features/questions/QuestionEditor.svelte` with a blank typed draft from
`../features/questions/model.ts`; existing reference screens keep their fixture content. Required,
choices, title, and hints start empty/off. Numeric controls keep structural
limits. Validation, pending saves, offline failures, and retry use the shared
`Submission` lifecycle. Successful questions appear in the local form and can
be reopened. API-key create/rename also validates empty names and preserves
fields when offline. These are mock-session mutations, not new server APIs.

See [feature structure](../../../FEATURE_STRUCTURE.md) for ownership, extension
patterns, named routes/actions, native-page registration, and the reference adapter boundary.
