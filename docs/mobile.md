# Mobile (Expo) notes — CHR-142, CHR-150, CHR-164, CHR-177

Spike findings for React Native / Expo in this monorepo.

## Auth and associated domains (CHR-177)

- Expo `scheme` is `gagnechris` so Cognito can return to `gagnechris://auth/callback` (already on the iOS app client).
- Apex hosts `/.well-known/apple-app-site-association` and `/.well-known/webauthn` (CloudFront passes `/.well-known/*` through; deploy forces `Content-Type: application/json`). Replace `APPLE_TEAM_ID` before shipping Associated Domains.
- **Passkey RP ID** stays `auth.gagnechris.com` — see [ADR 0001](./adr/0001-passkey-rp-id.md). iOS sign-in should use managed login in `ASWebAuthenticationSession`, not native `ASAuthorization` against the apex.
- Cognito refresh tokens last **30 days**. Acceptable for v1: after a month offline the user signs in again. No silent refresh beyond Cognito’s refresh token lifetime.
- `TokenProvider` in `@gagnechris/api-client` accepts `{ forceRefresh?: boolean }` and retries once on HTTP 401.

## What works

- `apps/mobile` (Expo SDK 57) imports:
  - `@gagnechris/shared` (domain Zod schemas)
  - `@gagnechris/api-client` (`TokenProvider` + OpenAPI client)
  - `@gagnechris/app-core` (UI-free admin hooks)
  - `@gagnechris/tokens` (numeric color/space tokens for RN `StyleSheet`)
- Metro monorepo config watches the repo root and remaps NodeNext `.js` → `.ts`/`.tsx` so shared packages do not need a separate compile step.
- Package `exports` already include a `react-native` condition on shared packages (CHR-139 / CHR-140).

## Install layout: not a root workspace

`apps/mobile` is **deliberately outside the root `workspaces`** and keeps its own `apps/mobile/package-lock.json`. Expo and React Native add ~400 packages, and as a root workspace every web / API / infra CI job installed them.

| Lockfile                       | Packages |
| ------------------------------ | -------- |
| root, with mobile (before)     | 979      |
| root, without mobile (after)   | 571      |
| `apps/mobile` (mobile CI only) | 537      |

First-party packages are linked with `file:` specifiers (`"@gagnechris/shared": "file:../../packages/shared"`), so Metro and `tsc` still read the TypeScript sources with no build step.

Consequences:

- Install mobile deps with `npm ci` (or `npm install`) **inside `apps/mobile`** — a root install does not cover it.
- Root `npm run typecheck` / `npm test` / `npm run lint` no longer include mobile. Use `--prefix apps/mobile`; the Mobile workflow does this.
- Adding a dependency to `packages/*` needs `npm install` in `apps/mobile` too, to refresh its lockfile.

## React versions

Root and `apps/mobile` are both on React **19.3.0**. React Native 0.86.3 declares `react: ^19.2.3`, so the root version satisfies it and there is no reason to split.

The two lockfiles still produce two copies on disk, which is harmless at runtime (Metro's `nodeModulesPaths` puts `apps/mobile/node_modules` first) but not in tests: a bare `react` or `@tanstack/react-query` import from app-core resolves to the root copy, and two instances break hooks. `apps/mobile/vitest.config.mts` sets `resolve.dedupe: ['react', '@tanstack/react-query']`, and `src/app-core.test.ts` renders an app-core autosave hook plus a versioned-resource query hook so the duplicate would fail the suite rather than surface as a confusing "invalid hook call" / "Cannot read properties of null (reading 'useContext')" (CHR-173).

## CI

`.github/workflows/mobile.yml` is path-filtered and uses no AWS credentials. It runs:

1. Root `npm ci`, then `npm ci` in `apps/mobile`.
2. Typecheck for `shared`, `api-client`, `tokens`, `app-core`, and mobile; **test** for `api-client`, `tokens`, `app-core`, and mobile (not `shared` — shared tests run in root CI); lint for mobile.
3. `npm run export:ios` — `expo export --platform ios --source-maps`.
4. `npm run check:bundle` — fails if any sourcemap lists a `.d.ts` source, if zod is missing, if `zod/v3/` appears, or if `zod/v4/` is absent (CHR-164).
5. `npm run smoke:bundle` — builds a Metro bundle from `scripts/smoke-entry.ts` with the app's real `metro.config.js` and **executes it in Node**, evaluating shared Zod schemas, asserting Zod 4 APIs (`z.email`), and resolving app-core `createVersionedResource` (including its `useQuery` hook) + `fetch` through Metro (CHR-173). Hook rendering under a single React / react-query instance is asserted in `src/app-core.test.ts`.

Steps 4 and 5 exist because "Export succeeded (N modules)" is not evidence (CHR-150). The CHR-142 resolver remapped `.js` → `.d.ts` for every module including `node_modules`, so `zod/v4/classic/external.js` resolved to a type-only declaration. The export succeeded, and the app threw `TypeError: undefined is not a function` at module load on device. Reverting `metro.config.js` makes step 4 report the `.d.ts` sources and step 5 fail with `TypeError: _zod.z.literal is not a function`.

A later failure mode (CHR-164): Expo CLI's transitive `zod@3` was hoisted into `apps/mobile/node_modules/zod` while shared typechecks against zod 4. With `disableHierarchicalLookup`, Metro resolved shared's `import 'zod'` to v3. Pin `"zod": "^4.6.5"` on `apps/mobile` so the app's copy wins; step 4 rejects v3 paths.

`tokens:check` in the main CI workflow regenerates `packages/tokens/src/variables.css` and fails on drift, the same way `openapi:check` guards the API contract.

## Design tokens

`tokens.text`, `tokens.space`, and `tokens.radius` are **px numbers**, so RN uses them directly (`padding: tokens.space[4]`). The generator converts them to `rem` for CSS and derives the `/* 16px */` comments from the values. Colors, shadows, transitions, and fonts stay CSS-ready strings.

## Offline architecture decision (CHR-177)

Notebook will be offline-capable; the spike has no local store yet. Decisions that shape shared contracts **before** Notebook web hooks land:

| Concern                                 | Decision                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Where outbox + conflict logic lives** | **`@gagnechris/app-core`** — platform-neutral queue, retry, and version/If-Match conflict helpers. Web and mobile call the same API; UI adapters stay in each app.                                  |
| **Local persistence (mobile)**          | **Not chosen yet** (SQLite / MMKV / AsyncStorage). Persist behind a small storage interface in the mobile app so app-core stays free of RN modules. Pick when CHR-51 / Notebook mobile work starts. |
| **TanStack Query**                      | Wire `focusManager` / `onlineManager` to AppState + NetInfo in the mobile app (not in app-core). Optional persister is app-local.                                                                   |
| **Client IDs**                          | Use `@gagnechris/shared` `createUlid()` (injectable `crypto.getRandomValues`; polyfill with `expo-crypto` on Hermes if needed).                                                                     |
| **Sync**                                | Server remains source of truth via the CHR-172 sync contract; outbox drains with If-Match / 409 handling from app-core.                                                                             |

## Local stack

Admin routes on the local API accept the fake bearer `local-dev-token` (`VITE_AUTH_MODE=local`). The spike screen calls:

1. `GET /api/health` (public)
2. `GET /api/admin/home` (authed)

## Verification

```bash
cd apps/mobile
npm ci
npm run typecheck
npm test
npm run export:ios && npm run check:bundle
npm run smoke:bundle
```

iOS Simulator: `npm run ios --prefix apps/mobile` (requires Xcode Simulator). Nothing here has run on a device yet — the bundle smoke replaces the earlier claim that `expo export` alone de-risked Metro resolution (CHR-49, CHR-142). Launching on a simulator is still the only proof for the RN runtime itself.
