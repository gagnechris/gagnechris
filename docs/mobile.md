# Mobile (Expo) notes — CHR-142, CHR-150

Spike findings for React Native / Expo in this monorepo.

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

The two lockfiles still produce two copies on disk, which is harmless at runtime (Metro's `nodeModulesPaths` puts `apps/mobile/node_modules` first) but not in tests: a bare `react` import from app-core resolves to the root copy, and two React instances break hooks. `apps/mobile/vitest.config.mts` sets `resolve.dedupe: ['react']`, and `src/app-core.test.ts` renders an app-core hook so the duplicate would fail the suite rather than surface as a confusing "invalid hook call".

## CI

`.github/workflows/mobile.yml` is path-filtered and uses no AWS credentials. It runs:

1. Root `npm ci`, then `npm ci` in `apps/mobile`.
2. Typecheck + test for `shared`, `api-client`, `tokens`, `app-core`, and mobile; lint for mobile.
3. `npm run export:ios` — `expo export --platform ios --source-maps`.
4. `npm run check:bundle` — fails if any sourcemap lists a `.d.ts` source, or if the zod runtime is missing from the bundle.
5. `npm run smoke:bundle` — builds a Metro bundle from `scripts/smoke-entry.ts` with the app's real `metro.config.js` and **executes it in Node**, evaluating shared Zod schemas.

Steps 4 and 5 exist because "Export succeeded (N modules)" is not evidence (CHR-150). The CHR-142 resolver remapped `.js` → `.d.ts` for every module including `node_modules`, so `zod/v4/classic/external.js` resolved to a type-only declaration. The export succeeded, and the app threw `TypeError: undefined is not a function` at module load on device. Reverting `metro.config.js` makes step 4 report the `.d.ts` sources and step 5 fail with `TypeError: _zod.z.literal is not a function`.

The remap is now scoped to **relative specifiers from first-party files** (`apps/mobile` and `packages/`), and the `.d.ts` candidate is gone.

`tokens:check` in the main CI workflow regenerates `packages/tokens/src/variables.css` and fails on drift, the same way `openapi:check` guards the API contract.

## Design tokens

`tokens.text`, `tokens.space`, and `tokens.radius` are **px numbers**, so RN uses them directly (`padding: tokens.space[4]`). The generator converts them to `rem` for CSS and derives the `/* 16px */` comments from the values. Colors, shadows, transitions, and fonts stay CSS-ready strings.

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
