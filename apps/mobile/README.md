# Mobile (Expo)

Expo app (expo-router, dev client) for Notebook on iPhone: tabs for Today,
Upcoming, Notes, Tasks and More, the Work / Personal / All area switch, and the
No access screen. It runs the monorepo client packages under Metro. The Notebook query
cache is persisted for offline reads (`src/cache/`), with an offline banner and
autosave retry on reconnect (`src/net/`); see
`docs/mobile.md#cached-reads-and-offline`.

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
press `i`. With Xcode 27, `expo run:ios` mistakes booted simulators for phones;
use `npm run ios:sim` with Metro running (see `docs/mobile.md`). An EAS simulator build (`npx eas-cli build --profile development
--platform ios`) is the alternative; see `docs/mobile.md#run-in-the-simulator`.

Override API target:

```bash
EXPO_PUBLIC_API_BASE_URL=https://gagnechris.com npm start --prefix apps/mobile
```

Against the local API, sign-in is the local fake auth
(`EXPO_PUBLIC_LOCAL_AUTH_GROUPS=site-admin` signs in without Notebook to show No
access). Anything else uses Cognito managed login and needs
`EXPO_PUBLIC_COGNITO_IOS_CLIENT_ID`; see `.env.example` and `docs/mobile.md#sign-in`.

## Packages exercised

- `@gagnechris/shared` — area filters, access levels, calendar labels, `createUlid`
- `@gagnechris/api-client` — `createApiClient` with the session's `getToken`
- `@gagnechris/app-core` — `AppApiProvider`
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
