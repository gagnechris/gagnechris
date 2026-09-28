# Mobile (Expo) — CHR-142 spike

Minimal Expo app that proves monorepo packages resolve under Metro.

## Run

```bash
# Terminal 1 — local CMS API (fake auth)
npm run local:dev

# Terminal 2 — Expo
npm run start -w @gagnechris/mobile
# then press i for iOS Simulator
```

Override API target:

```bash
EXPO_PUBLIC_API_BASE_URL=https://gagnechris.com npm run start -w @gagnechris/mobile
```

(Authenticated admin calls need a real Cognito ID token against prod; local uses `local-dev-token`.)

## Packages exercised

- `@gagnechris/shared` — `HealthResponseSchema`
- `@gagnechris/api-client` — `createApiClient` (public + TokenProvider)
- `@gagnechris/tokens` — primary/neutral colors on the spike screen

## Metro

`metro.config.js` watches the workspace root, sets `nodeModulesPaths`, enables package exports, and remaps NodeNext `.js` import specifiers to `.ts` / `.tsx`.

## React versions

Expo 57 pins `react@19.2.3`; web stays on `^19.3.0`. Versions are **isolated** (not forced via root overrides) — see `docs/mobile.md`.
