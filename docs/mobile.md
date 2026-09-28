# Mobile (Expo) notes — CHR-142

Spike findings for React Native / Expo in this monorepo.

## What works

- `apps/mobile` (Expo SDK 57) imports:
  - `@gagnechris/shared` (domain Zod schemas)
  - `@gagnechris/api-client` (`TokenProvider` + OpenAPI client)
  - `@gagnechris/tokens` (TS color/space tokens for RN `StyleSheet`)
- Metro monorepo config watches the repo root and remaps NodeNext `.js` → `.ts`/`.tsx` so shared packages do not need a separate compile step.
- Package `exports` already include a `react-native` condition on shared packages (CHR-139 / CHR-140).

## React version strategy

| Surface                 | React               |
| ----------------------- | ------------------- |
| Expo 57 / `apps/mobile` | `19.2.3` (Expo pin) |
| `apps/web`              | `^19.3.0`           |

**Decision: isolate, do not force a single override.** Forcing `overrides.react=19.2.3` broke web Vitest (React 19.3 vs 19.2 mismatch under Testing Library). Metro uses `disableHierarchicalLookup` + project/`workspace` `nodeModulesPaths` so the mobile app resolves Expo's React first. Documented trade-off: two React majors-compatible copies may exist in `node_modules`; that is acceptable for this spike. Revisit if Metro starts resolving the wrong copy at runtime.

## CI

`.github/workflows/mobile.yml` runs path-filtered typecheck / lint / test for `apps/mobile` and dependent packages. It does **not** use the CDK admin deploy role (no AWS credentials).

## Local stack

Admin routes on the local API accept the fake bearer `local-dev-token` (`VITE_AUTH_MODE=local`). The spike screen calls:

1. `GET /api/health` (public)
2. `GET /api/admin/home` (authed)

## Verification (CHR-142)

```bash
npm run typecheck -w @gagnechris/mobile
npm test -w @gagnechris/mobile
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/mobile-export
```

iOS Simulator: `npm run ios -w @gagnechris/mobile` (requires Xcode Simulator). Metro resolution is proven via `expo export` in CI-adjacent local runs.
