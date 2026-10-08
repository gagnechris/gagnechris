# Mobile (Expo)

Expo app (expo-router, dev client) that runs the monorepo client packages under
Metro. Its one screen shows a client-generated ULID and `GET /api/health` from
the configured API. The Notebook query cache is persisted for offline reads
(`src/cache/`), with an offline banner and autosave retry on reconnect
(`src/net/`); see `docs/mobile.md#cached-reads-and-offline`.

This app is not part of the root npm workspaces and has its own lockfile, so its
dependencies install separately. See `docs/mobile.md`.

## Run

```bash
# Once, and after any packages/* dependency change
npm ci --prefix apps/mobile

# Terminal 1 — local CMS API (fake auth)
npm run local:dev

# Terminal 2 — build and launch the dev client in the iOS Simulator
npm run ios --prefix apps/mobile   # expo run:ios
```

With the dev client already installed, `npm start --prefix apps/mobile` and
press `i`. An EAS simulator build (`npx eas-cli build --profile development
--platform ios`) is the alternative; see `docs/mobile.md#run-in-the-simulator`.

Override API target:

```bash
EXPO_PUBLIC_API_BASE_URL=https://gagnechris.com npm start --prefix apps/mobile
```

(Authenticated admin calls need a real Cognito ID token against prod; local uses `local-dev-token`.)

## Packages exercised

- `@gagnechris/shared` — `HealthResponseSchema`, `createUlid`
- `@gagnechris/api-client` — `createApiClient` (public + TokenProvider)
- `@gagnechris/app-core` — `AppApiProvider`, `useGetApiClient`
- `@gagnechris/tokens` — colors plus numeric space / text / radius scales

## Bundle checks

```bash
npm run export:ios      # expo export --platform ios --source-maps
npm run check:bundle    # no .d.ts; zod/v4, app-core, react-query, persister, netinfo, expo-crypto, expo-router present; no zod/v3
npm run smoke:bundle    # Metro bundle run in Node: zod v4, polyfilled ULID, app-core hook render
```

`expo export` succeeding is not evidence on its own: a resolver that maps
`zod`'s `.js` files to `.d.ts` still exports, and the app crashes at module load.
`check:bundle` and `smoke:bundle` catch that.

## Metro

`metro.config.js` watches the workspace root, sets `nodeModulesPaths`, enables
package exports, and remaps NodeNext `.js` specifiers to `.ts` / `.tsx` — only
for relative imports from first-party files, never `node_modules`.

## React versions

Root and this app are both on React `19.3.0` (RN 0.86.3 accepts `^19.2.3`).
Two copies exist on disk because of the split lockfiles; see `docs/mobile.md`.
