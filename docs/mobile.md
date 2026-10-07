# Mobile (Expo)

`apps/mobile` is an Expo (SDK 57, React Native 0.86.3) app that runs the monorepo's client packages under Metro. Its single screen shows the API base URL and a button that calls:

1. `GET /api/health` (public client, parsed with `HealthResponseSchema`)
2. `GET /api/admin/home` (authed client), then shows the result's version and status

The app has no local store and no offline support, and it does not render notes yet. When it does, it should parse task embeds (`{{task:<ULID>}}` lines, see [data-model.md](./data-model.md#task-embeds)) with the shared helpers and render them from the task records, or fall back to `taskEmbedFallbackLine` so a raw token never shows. `src/ulid.ts` re-exports `createUlid` from `@gagnechris/shared` for client-generated ids.

## What it imports

- `@gagnechris/shared` (domain Zod schemas)
- `@gagnechris/api-client` (`TokenProvider` + OpenAPI client)
- `@gagnechris/app-core` (UI-free admin hooks)
- `@gagnechris/tokens` (numeric color/space tokens for RN `StyleSheet`)

Metro config (`metro.config.js`) watches the repo root, sets `nodeModulesPaths` and `disableHierarchicalLookup`, enables package exports, and remaps NodeNext `.js` specifiers to `.ts`/`.tsx` (only for relative imports from first-party files, never `node_modules`), so shared packages need no separate compile step. Package `exports` on the shared packages include a `react-native` condition.

## API target and auth

- `EXPO_PUBLIC_API_BASE_URL` sets the API origin; the default is the local API at `http://127.0.0.1:8787` (`npm run local:dev`).
- The authed client sends the fake bearer `local-dev-token`, which the local API maps to the default local admin (`local-dev-user`, the same user `VITE_AUTH_MODE=local` signs in as). Authenticated calls against production need a real Cognito ID token.
- `TokenProvider` in `@gagnechris/api-client` accepts `{ forceRefresh?: boolean }`. On a 401 or 403 the client calls it once with `forceRefresh: true` and retries the request once with the new token. Requests already in flight when a refresh starts share it, so concurrent 401s cause one refresh. If the refresh throws or returns no token, the caller gets the original response.

### iOS sign-in and associated domains

- Expo `scheme` is `gagnechris`, so Cognito can return to `gagnechris://auth/callback` (registered on the iOS app client). iOS bundle id is `com.gagnechris.mobile`, with associated domains `applinks:gagnechris.com` and `webcredentials:gagnechris.com`.
- Each host serves its own `/.well-known/apple-app-site-association`, never redirected (Apple fetches it without following redirects); deploy forces `Content-Type: application/json`:
  - Apex (`apps/web/public/.well-known/`): `webcredentials` only, no `applinks`. The apex also serves `/.well-known/webauthn`.
  - `notebook.gagnechris.com` (`apps/web/public-notebook/.well-known/`): `applinks` for `/today`, `/notes/*` and `/tasks/*`, with `"exclude": true` on `/auth/*` so web sign-in on an iPhone with the app installed stays in the browser.
  - `applinks:gagnechris.com` in `app.json` matches no paths; universal links need `applinks:notebook.gagnechris.com`. A universal-link OAuth callback, if added, should use its own path (for example `/ios/auth/callback`) on the iOS client only.
- Replace `APPLE_TEAM_ID` in both AASA files before shipping Associated Domains.
- **Passkey RP ID** is `auth.gagnechris.com` — see [ADR 0001](./adr/0001-passkey-rp-id.md). iOS sign-in uses managed login in `ASWebAuthenticationSession`, not native `ASAuthorization` against the apex.
- Cognito refresh tokens last **30 days**; after a month without a refresh the user signs in again. There is no silent refresh beyond Cognito’s refresh token lifetime.

## Install layout: not a root workspace

`apps/mobile` is **outside the root `workspaces`** and keeps its own `apps/mobile/package-lock.json`, so web / API / infra installs and CI jobs never install Expo and React Native.

First-party packages are linked with `file:` specifiers (`"@gagnechris/shared": "file:../../packages/shared"`), so Metro and `tsc` read the TypeScript sources with no build step.

Consequences:

- Install mobile deps with `npm ci` (or `npm install`) **inside `apps/mobile`** — a root install does not cover it.
- Root `npm run typecheck` / `npm test` / `npm run lint` do not include mobile. Use `--prefix apps/mobile`; the Mobile workflow does this.
- Adding a dependency to `packages/*` needs `npm install` in `apps/mobile` too, to refresh its lockfile.

## React versions

Root and `apps/mobile` are both on React **19.3.0**. React Native 0.86.3 declares `react: ^19.2.3`, so the root version satisfies it.

The two lockfiles produce two copies on disk, which is harmless at runtime (Metro's `nodeModulesPaths` puts `apps/mobile/node_modules` first) but not in tests: a bare `react` or `@tanstack/react-query` import from app-core resolves to the root copy, and two instances break hooks. `apps/mobile/vitest.config.mts` sets `resolve.dedupe: ['react', '@tanstack/react-query']`, and `src/app-core.test.ts` renders an app-core autosave hook (`useQueuedAutosave`) plus a versioned-resource query hook (`createVersionedResource`) so a duplicate fails the suite rather than surfacing as a confusing "invalid hook call" / "Cannot read properties of null (reading 'useContext')".

## Zod version

`apps/mobile` pins `"zod": "^4.6.5"`. Expo CLI depends on `zod@3` transitively; without the pin that copy can be hoisted into `apps/mobile/node_modules/zod`, and with `disableHierarchicalLookup` Metro would resolve shared's `import 'zod'` to v3 while shared typechecks against v4. `check:bundle` rejects v3 paths.

## CI

`.github/workflows/mobile.yml` uses no AWS credentials. It runs on every PR and push to `main` so the required check **Mobile typecheck, lint, test, bundle** always reports; an in-job `dorny/paths-filter` step skips the steps below (the job still passes) unless mobile, the client packages, the root lockfile or the workflow changed. When it applies, it runs:

1. Root `npm ci`, then `npm ci` in `apps/mobile`.
2. Typecheck for `shared`, `api-client`, `tokens`, `app-core`, and mobile; **test** for `api-client`, `tokens`, `app-core`, and mobile (not `shared` — shared tests run in root CI); lint for mobile.
3. `npm run export:ios` — `expo export --platform ios --source-maps`.
4. `npm run check:bundle` — fails if any sourcemap lists a `.d.ts` source, if zod is missing, if `zod/v3/` appears, or if `zod/v4/` is absent.
5. `npm run smoke:bundle` — builds a Metro bundle from `scripts/smoke-entry.ts` with the app's real `metro.config.js` and **executes it in Node**, evaluating shared Zod schemas, asserting Zod 4 APIs (`z.email`), and resolving app-core `createVersionedResource` (including its `useQuery` hook) + `fetch` through Metro. Hook rendering under a single React / react-query instance is asserted in `src/app-core.test.ts`.

A successful `expo export` alone does not prove the bundle runs: a resolver that maps `.js` to `.d.ts` inside `node_modules` (for example `zod/v4/classic/external.js`) exports cleanly, then throws `TypeError: undefined is not a function` at module load. Step 4 reports the `.d.ts` sources and step 5 fails (e.g. `TypeError: _zod.z.literal is not a function`).

`tokens:check` in the main CI workflow regenerates `packages/tokens/src/variables.css` and fails on drift, the same way `openapi:check` guards the API contract.

## Design tokens

`tokens.text`, `tokens.space`, and `tokens.radius` are **px numbers**, so RN uses them directly (`padding: tokens.space[4]`). The generator converts them to `rem` for CSS and derives the `/* 16px */` comments from the values. Colors, shadows, transitions, and fonts are CSS-ready strings.

## Verification

```bash
cd apps/mobile
npm ci
npm run typecheck
npm test
npm run export:ios && npm run check:bundle
npm run smoke:bundle
```

iOS Simulator: `npm run ios --prefix apps/mobile` (requires Xcode Simulator). The bundle smoke covers Metro resolution and module evaluation; only launching on a simulator or device exercises the RN runtime itself.
