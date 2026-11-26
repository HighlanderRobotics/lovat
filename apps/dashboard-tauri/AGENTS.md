# Dashboard (Tauri + Svelte) agent instructions

- This is the in-progress rewrite of `apps/dashboard` (Flutter). Until it replaces the Flutter app, keep both behaviorally equivalent: when a Dashboard feature, API call, or season metric changes in one, mirror it in the other or note the gap in the PR.
- Use npm with the committed lockfile and Node 22.20.0 (`.nvmrc`). Rust comes from the stable toolchain; Tauri plugins are pinned in `src-tauri/Cargo.toml`.
- Run `npm run check`, `npm test`, and `npm run build` for frontend changes; run `cargo check` in `src-tauri` for Rust or capability changes.
- SvelteKit 3 is configured through the `sveltekit()` Vite plugin. Import app code through the `#lib/*` subpath alias with explicit extensions (`#lib/metrics.ts`, `#lib/toast.svelte.ts`).
- In `$effect`, wrap calls that read and write component state in `untrack` so the effect depends only on its intended inputs.
- API paths, response shapes, Auth0 configuration, deep links (`com.frc8033.lovatdashboard`), versions, and season metrics are cross-app contracts.
- `tool/dev-api.mjs` serves synthetic data only. Never add real scouting data, notes, or team strategy to it.
- Keep Tauri HTTP scopes in `src-tauri/capabilities/default.json` as narrow as the features require.
