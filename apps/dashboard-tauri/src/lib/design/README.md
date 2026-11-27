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
success state; they do not modify server data. Input edits are local to the
current view. New Forms and API-key mock views do not imply new server endpoints.
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

Runtime screens fill the usable viewport, including iOS safe areas and keyboard
resizing. `layouts.json` identifies headers, scrolling bodies, bottom actions,
and tab bars; their positions stay independent of the reference frame height.
`tool/audit-design-layout.cjs` regenerates this metadata against a mock build
served on port 1430. Add `?reference=1` to retain the original Figma dimensions
for visual comparisons, including the Forms status-bar placeholder.

Navigation preloads the destination and uses short native View Transitions with
separate content/header/footer snapshots. Reduced-motion preferences skip these
animations. Mobile viewport and gesture handling keep the app at 1x zoom while
allowing ordinary scrolling; mobile inputs use a 16px font to prevent focus zoom.
