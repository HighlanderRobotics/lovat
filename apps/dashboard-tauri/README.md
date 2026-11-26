# Lovat Dashboard (Tauri + Svelte)

A rewrite of the [Flutter Dashboard](../dashboard/README.md) as a SvelteKit single-page app that ships to the web and, through [Tauri 2](https://v2.tauri.app), as native desktop and mobile apps. It talks to the same Lovat Server API and Auth0 tenant as the Flutter app.

Return to the [monorepo README](../../README.md).

## Status

Every screen reachable from the Flutter app's navigation is ported: Home, team rankings, match schedule, Team Lookup (categories, breakdowns, notes, metric details with charts and auto paths), raw scout reports, alliance analysis, match predictor, picklists (local, shared, mutable), picked teams, scouters, the scouter schedule editor, QR report scanning, Settings, onboarding, and the `/set-url` development link. Two legacy Flutter routes that nothing links to, `preview_over` and `display_qr_codes`, were not ported.

The Flutter app remains the shipping Dashboard until this one is verified against production and the hosting and store pipelines move over.

## Commands

```bash
npm ci
npm run dev          # web, http://localhost:1420
npm run check        # svelte-check + TypeScript
npm test             # Vitest unit tests
npm run build        # static SPA in build/
npm run tauri:dev    # native desktop window (needs Rust)
npm run tauri:build  # native bundles
```

### Working without Auth0

`tool/dev-api.mjs` is a synthetic Lovat Server. Run it beside the dev server and pass a dev token, which `vite dev` uses instead of signing in (production builds drop this code path):

```bash
node tool/dev-api.mjs
LOVAT_API_BASE=http://127.0.0.1:9879 DEV_LOVAT_TOKEN=dev npm run dev
```

Onboarding still expects a real sign-in; to skip it, set `localStorage.onboardingVersion = '1'` in the browser console.

## How it is put together

- `src/lib/api/client.ts` is the HTTP client. It attaches the Auth0 token and the same `X-*` headers as Flutter, keeps an ETag cache in local storage, and clears that cache whenever the token or server changes. In Tauri, requests go through `@tauri-apps/plugin-http` so the API's CORS policy does not apply.
- `src/lib/api/query.svelte.ts` ports `StaleRefreshBuilder`: pages show cached data immediately, refetch in the background, and offer a retry toast if the refresh fails.
- `src/lib/api/endpoints.ts` holds every server call, with paths and status handling copied from `apps/dashboard/lib/reusable/lovat_api`.
- `src/lib/auth` signs in with `@auth0/auth0-spa-js` in browsers. In Tauri it uses Authorization Code + PKCE through the system browser with the native Auth0 client that the Flutter mobile apps use, receives the redirect on `com.frc8033.lovatdashboard://`, and stores tokens with `plugin-store`.
- `src/lib/metrics.ts` and `src/lib/flags.ts` define the 2026 season metrics, breakdowns, picklist weights, and team tags.

## Configuration

Build-time variables use the Flutter `--dart-define` names (see `.env.example`): `LOVAT_API_BASE`, `LOVAT_WEBSITE_URL`, and the optional sandbox trio `LOVAT_SANDBOX_AUTH0_DOMAIN`, `LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID`, `LOVAT_SANDBOX_AUTH0_AUDIENCE`. Sandbox values are validated the same way as in Flutter: all three or none, and never pointing at production.

### Auth0 setup required before native sign-in works

The native client must allow these callback URLs, matching the shape `auth0_flutter` registers:

- `com.frc8033.lovatdashboard://lovat.us.auth0.com/macos/com.frc8033.lovatdashboard/callback` (already used by Flutter on macOS)
- the same URL with `windows`, `linux`, `ios`, or `android` in place of `macos` for those platforms

The web build reuses the existing web client and needs the hosting origin in its allowed callback, logout, and web-origin lists, as the Flutter web build does.

## Hosting

`Dockerfile` and `Caddyfile` mirror the Flutter web image: build with `LOVAT_API_BASE` and `LOVAT_WEBSITE_URL` (required), serve `build/` with SPA fallback and `/healthz`. Railway is not wired to this app yet.

## Native notes

- macOS camera access for QR scanning uses `src-tauri/Info.plist`. Signed, hardened builds also need the `com.apple.security.device.camera` entitlement.
- Deep links only reach the app from a bundled build on macOS; `tauri dev` cannot receive the Auth0 redirect there.
- Mobile targets are configured (`identifier` and URL scheme match the Flutter app) but `tauri android init` / `tauri ios init` have not been run.
