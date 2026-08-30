# Collection agent instructions

- Use Node.js 24.6.0 from `.nvmrc` and install with `npm ci`.
- Run `npm run lint`, `npm run format:check`, and `npm run ts:check` for code changes.
- Run native builds only when the task requires them; macOS and Xcode are required for iOS.
- Never put secrets in `EXPO_PUBLIC_*`; those values are compiled into client builds.
- Report events, offline migrations, QR-code fallback, deep links, and upload payloads are compatibility-sensitive.
- Preserve EAS project ownership, identifiers, profiles, and signing configuration.
- Android and web have documented pre-existing issues; do not conceal them by weakening checks.
