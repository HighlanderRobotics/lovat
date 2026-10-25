# Lovat Collection

Collection is the Expo and React Native client used by scouters to record match events, complete post-match observations, retain reports offline, and upload them to Lovat Server.

Return to the [monorepo README](../../README.md).

## Prerequisites

- Node.js 24.6.0
- Expo and EAS tooling
- macOS and Xcode for iOS builds
- Android Studio and the Android SDK for Android builds

## Commands

```bash
npm ci
npm start
npm run ios
npm run android
npm run lint
npm run format:check
npm run ts:check
```

Copy `.env.example` to an appropriate local environment file and set `EXPO_PUBLIC_API_URL` to the desired Server authority. `EXPO_PUBLIC_*` values are included in client builds and must never contain secrets.

Android and web have known pre-existing issues tracked as LVT-217 and LVT-220. Offline report migrations and QR-code fallback are compatibility-sensitive.

## Team post-match questions

Scouting leads configure up to three free-text questions in Dashboard settings. Collection refreshes them with the other services and caches them per API server and source team for offline use. Starting a match copies the cached questions into that report; later team edits do not change an active match or previously saved answers. Answers are optional, support up to 2,000 characters, and travel with the report through uploads, offline history, and QR codes.

## Tests and coverage

`npm test` runs the Jest/Expo unit and native component suite. `npm run test:coverage` additionally enforces 100% lines, branches, statements, and functions. `npm run test:watch` runs the watch UI.

Coverage includes every executable file under `app/`, `lib/`, the TypeScript artwork components in `assets/`, and the Expo plugins in `plugins/`, including files no test imports. Type declarations, test/configuration files, dependencies, and generated native/build output are outside the runtime coverage denominator. There are no coverage-ignore comments or skipped application paths. HTML, LCOV, JSON, and summary reports are generated in the ignored `coverage/` directory; open `coverage/lcov-report/index.html` locally. CI enforces the same gate and retains the report as `collection-coverage`.

The suite exercises scouting actions and piece/grid restrictions, pre-match setup, defence holds, charge-station locking, no-show role selection, post-match answers, onboarding, settings, report history and migrations, duplicate submissions, QR reassembly, connectivity, scoped offline caches, API failures, and native build plugins. Native OS presentation and drivers are mocked; report logic, stores, screens, serialization, and callbacks remain real. No test sends HTTP requests to a real service. Automated coverage does not replace installation checks on a physical device.

## No-show reports

Choose **No show** under post-match roles only when the robot did not appear on the field. It replaces any other selected roles; choosing a performed role clears No show. **Immobile** means the robot appeared but could not move. An empty event timeline alone never automatically marks a robot absent. The exported 2023 role value is `NO_SHOW`, including offline history and QR data.
