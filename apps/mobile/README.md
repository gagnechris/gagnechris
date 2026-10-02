# Mobile (Expo) — CHR-142 spike

Minimal Expo app that proves monorepo packages resolve **and run** under Metro.

This app is not part of the root npm workspaces and has its own lockfile, so its
dependencies install separately. See `docs/mobile.md`.

## Run

```bash
# Once, and after any packages/* dependency change
npm ci --prefix apps/mobile

# Terminal 1 — local CMS API (fake auth)
npm run local:dev

# Terminal 2 — Expo
npm run mobile
# then press i for iOS Simulator
```

Override API target:

```bash
EXPO_PUBLIC_API_BASE_URL=https://gagnechris.com npm start --prefix apps/mobile
```

(Authenticated admin calls need a real Cognito ID token against prod; local uses `local-dev-token`.)

## Packages exercised

- `@gagnechris/shared` — `HealthResponseSchema`
- `@gagnechris/api-client` — `createApiClient` (public + TokenProvider)
- `@gagnechris/app-core` — `useQueuedAutosave` (single-React check)
- `@gagnechris/tokens` — colors plus numeric space / text / radius scales

## Bundle checks

```bash
npm run export:ios      # expo export --platform ios --source-maps
npm run check:bundle    # no .d.ts; zod/v4 present; no zod/v3
npm run smoke:bundle    # Metro bundle + zod v4 smoke in Node
```

`expo export` succeeding is not evidence on its own: the original resolver
bundled `zod`'s `.d.ts` files and the app crashed at module load (CHR-150).

## Metro

`metro.config.js` watches the workspace root, sets `nodeModulesPaths`, enables
package exports, and remaps NodeNext `.js` specifiers to `.ts` / `.tsx` — only
for relative imports from first-party files, never `node_modules`.

## React versions

Root and this app are both on React `19.3.0` (RN 0.86.3 accepts `^19.2.3`).
Two copies exist on disk because of the split lockfiles; see `docs/mobile.md`.
