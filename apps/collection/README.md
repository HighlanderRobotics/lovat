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
