# Architecture

Personal site + headless CMS on AWS. Public pages are **statically prerendered** into S3 and served by CloudFront. The React admin talks to a Lambda API over API Gateway; publish writes update DynamoDB, which triggers a publisher Lambda that rebuilds HTML/PDF/feeds and invalidates CloudFront.

## Request flow

1. **Browser → CloudFront** (`gagnechris.com`)
2. **Viewer request** CloudFront Function:
   - `/api/*` and `/media/*` → pass through (API Gateway / media origin)
   - `/` → `/index.html` (prerendered home)
   - `/resume`, `/blog`, `/contact`, `/dont-feed-the-bears` → Option B `{path}/index.html`
   - `/blog/<slug>` → Option B only when the slug is in the CloudFront KeyValueStore; otherwise `/404.html` (avoids raw S3 XML). Until the publisher writes a `__synced__` sentinel, unknown slugs fail open (Option B for any slug).
   - `/admin/*` and `/auth/*` → `/spa.html` (neutral SPA shell, not the home prerender)
   - Other extensionless paths → `/404.html`
3. **Viewer response** sets security headers; serving `/404.html` is forced to HTTP 404
4. **S3** holds the site objects (prerendered HTML, assets, `posts.json`, `rss.xml`, `sitemap.xml`, `resume.pdf`, `spa.html`)
5. **API Gateway → Lambda API** for CRUD, publish, contact, resume download notify
6. **DynamoDB** single table (`gagnechris-prod`); Streams (`NEW_AND_OLD_IMAGES`) feed the publisher
7. **Publisher Lambda** renders markdown → HTML, regenerates index feeds/PDF, syncs published slug KeyValueStore, invalidates CloudFront paths. Failed stream records (after retries) land on an SQS on-failure queue.
8. **Cognito** (passkeys) protects admin routes; **SES** sends contact and download notifications

API and publisher Lambdas share the `NodeLambda` CDK construct (arm64, esbuild bundling, log retention, Powertools env, standard alarms).

## Draft vs published

| Concern                 | Behavior                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin autosave          | Writes **draft** items only (`META` / draft home & resume). Live site unchanged.                                                                     |
| Publish                 | Writes a **live snapshot** (`PUBLISHED` for posts; published home/resume). Stream filter is snapshot-only so draft edits never invoke the publisher. |
| Unpublish / soft-delete | Removes the live snapshot; publisher removes HTML and updates feeds/KVS.                                                                             |
| Optimistic concurrency  | `version` on entities; conflicting publishes return 409.                                                                                             |

API repositories share one layering:

- `VersionedEntityRepository` — optimistic concurrency + cursor queries (no publish state; for Notebook notes/tasks).
- `PublishableRepository` / `PublishableSingletonRepository` — draft `META` + optional `PUBLISHED` snapshot (posts / home / resume). Publish, unpublish, discard, and `hasUnpublishedChanges` live here once.
- Posts keep slug claims and tag-index side effects in `posts/mutation-builders.ts`.

Mutating admin endpoints accept the client's expected `version`; 409 responses include `currentVersion` and `current`.

Details: [data-model.md](./data-model.md).

## Publisher outputs

Stream scope (`collectRebuildScope`) selects **publish targets** under
`services/publisher/src/publish-targets/targets/*.target.ts`. Each target is
listed in the explicit `publishTargets` array in `publish-targets/registry.ts`
(esbuild bundles those imports). Targets return `{ artifacts, deleteKeys,
invalidationPaths }`; the orchestrator writes, deletes, and invalidates.
CloudFront KeyValueStore slug sync remains a post-step after invalidation
(CHR-123 order). Adding a page is one new `*.target.ts` plus one registry
entry — no `rebuild-scope.ts` edits.

On relevant stream events the publisher updates, among others:

- `/index.html`, `/resume/index.html`, `/blog/<slug>/index.html` (prerendered pages)
- `/blog/posts.json`, `/rss.xml`, `/sitemap.xml`
- `/resume.pdf` (pdf-lib + Inter fonts)
- CloudFront KeyValueStore keys for known published slugs
- Targeted CloudFront invalidations

The Vite `apps/web` build produces the SPA shell and admin chunks; it does **not** generate the sitemap/RSS/posts index.

## Admin data layer (TanStack Query)

Admin routes (`AdminLayout`) wrap children in `AdminQueryProvider` (`@tanstack/react-query`). Public pages stay outside Query so the public bundle stays lean.

- Query-key factories, API helpers, and TanStack Query hooks live in `@gagnechris/app-core` (re-exported from `apps/web/src/admin/query/` for the admin SPA).
- `createDraftPublishResource` builds query + lifecycle mutators from config (post / home / resume; a new entity is config only).
- `useVersionedEntityEditor` owns hydrate-once, version binding, performSave, autosave, and publish/unpublish/discard/delete-with-hold (no DOM). The web shell adds confirm / leave-guards / shortcuts.
- List/detail queries replace hand-rolled `useEffect` loading; mutations update or remove related cache entries (e.g. publish/delete updates the posts list without a manual refetch).
- Autosave still uses `useQueuedAutosave`; on success it writes the entity into the Query cache.
- Optimistic update + rollback: `optimisticMutationHandlers` supports one key or `targets[]` for multi-key snapshot/rollback (Notebook Today + Tasks).
- Typed HTTP client: `@gagnechris/api-client` with injectable `TokenProvider` (web passes Amplify `getIdToken`; public calls omit the token). Admin pages use `useGetApiClient()` / resource hooks — not per-call `createApiClient()` wrappers.
- Design tokens: `@gagnechris/tokens` (TS) generates `variables.css` imported by the web app. `text` / `space` / `radius` are px numbers for RN; the generator emits `rem` (`npm run tokens:check` guards drift).
- Mobile spike: `apps/mobile` (Expo) imports shared / api-client / app-core / tokens under Metro. Outside the root workspaces with its own lockfile, and CI executes a real Metro bundle — see `docs/mobile.md` (CHR-142, CHR-150).

## Admin editor foundation

Post, Home, and Resume containers are mostly field layout; shared wiring lives in app-core:

- `createDraftPublishResource` + `useVersionedEntityEditor` (hydrate, version, autosave, lifecycle, delete hold)
- `useQueuedAutosave` + `useDraftPublishEditor` (hold → busy → try/finally via `withHold`; delete awaits in-flight PUT)
- Web shell `apps/web/src/admin/useVersionedEntityEditor.ts` adds confirm, leave guards, and ⌘S / ⌘⏎ shortcuts
- UI primitives in `apps/web/src/ui/`: `Button`, `Field`/`TextInput`/`TextArea`/`Select`, `StatusBadge`, `SaveIndicator`, `EditorActionBar`, `Repeater` (stable ids + functional updates + reorder focus), `navLinkClass`
- Post editor splits container (`PostEditorPage`, keyed by `postId`) from presentational sections; `uploadImages(client, files)` takes the AppApiProvider client

## 404 handling

- Unknown / unpublished **blog slugs**: viewer-request checks KVS; miss → `/404.html` (not S3 `NoSuchKey` XML), once `__synced__` exists.
- Soft-deleted / unpublished posts: publisher removes objects and clears the KVS entry so subsequent requests 404 cleanly.
- Other unknown public paths: viewer-request rewrites to `/404.html` (not the home page).
- Admin client routes under `/spa.html`: React Router `NotFound` for unmatched paths.

## Auth

- Production admin: Cognito Hosted UI / passkeys (`VITE_COGNITO_*`). Callback at `/auth/callback`.
- Local: `VITE_AUTH_MODE=local` fakes a signed-in session; production builds refuse this flag.
- API authorizer validates Cognito JWTs for `/api/admin/*` and `/api/notebook/*` routes.
- Local API (`services/api/local/server.ts`) injects fake JWT claims on `/api/admin/*` and `/api/notebook/*` paths (mirroring API Gateway), so public routes still exercise the missing-auth path.

## Notebook sync contract (CHR-153 / CHR-162)

`GET /api/notebook/sync/changes` is the generic change feed real Notebook entities will use:

- **Client ULID** on create; retries with the same id + matching **create-time** payload hash (`createHash`) are idempotent (mismatch → 409). A durable `CREATED#<TYPE>#<id>` claim (TTL ≫ tombstone TTL) prevents offline create replays from resurrecting an entity after META TTL purge.
- **One sync row per entity** via sparse GSI3 (`syncPk` / `syncSk` on META). Soft delete sets `deleted=true`, bumps `version`, and sets item `ttl` (~30 days). `entityType` is stamped from sync config on every write.
- **`since` normalization + `nextSince` watermark** with a `SYNC_OVERLAP_MS` (15s) overlap window (≥ API Lambda timeout) so late-committed writes are delivered; clients dedupe by `(id, version)`.
- **Optimistic concurrency**: responses include strong `ETag: "<version>"`. Mutations accept `If-Match` or body `version`:
  - `If-Match: "<n>"` or weak `If-Match: W/"<n>"` — expect version `n`; mismatch → **412** with `currentVersion` + `current`
  - `If-Match: *` — resource must exist; server applies the mutation against the current version (missing → **404**)
  - Body-only `version` mismatch → **409** with `currentVersion` + `current`

Fixture-note spike routes were removed from the prod Lambda and public OpenAPI (CHR-153). Details: [data-model.md](./data-model.md).

## How to add an API route

1. Add a `defineRoute({ … })` in the owning module (e.g. `createPostRoutes` in `services/api/src/posts/handlers.ts`) or append to `services/api/src/routes.ts`. Prefer `defineRoute` so `params` / `query` / `body` schemas type the handler input (no casts).
2. Pattern is **without** the `/api` prefix (`/admin/posts/:id`, `/contact`). Incoming `/api/...` is stripped by the router.
3. Set `auth: 'admin' | 'public'`, optional zod `params` / `query` / `body`, and a handler `(ctx, input) => result`.
4. Handlers receive `ctx.userId`, `ctx.claims`, `ctx.logger`, `ctx.metrics`, and `ctx.requestId`. Do **not** add per-module try/catch — validation and `mapRouteError` run in `dispatchRoutes`.
5. Wrong method on a known path → **405** with an `Allow` header; unknown path → **404**. Malformed `%` escapes in path params → **400**. When multiple patterns match, **literal segments win** over `:param` (e.g. `/tasks/today` over `/tasks/:id`).
6. Per-route CloudWatch metrics use the route `metric` name (no redundant `route` dimension).
7. Keep these three places in sync (CI/tests assert agreement):
   - **Route table** `auth: 'admin'` patterns must live under `/admin` or `/notebook` (`API_GATEWAY_JWT_PREFIXES` in `services/api/src/router.ts`).
   - **API Gateway** JWT routes in `infra/lib/stacks/api-stack.ts` (`/api/admin`, `/api/notebook` + `{proxy+}`).
   - **OpenAPI** operation in `packages/shared/src/openapi.ts` (same method + `/api…` path as `routePatternToOpenApiPath`). Request schemas belong in `@gagnechris/shared` and are reused by both the API and the spec.
8. Local API (`services/api/local/server.ts`) injects fake JWT claims when the matched route has `auth: 'admin'` — it does not hard-code path prefixes.

## `@gagnechris/shared` entry points (CHR-139 / CHR-156)

| Import                            | Contents                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@gagnechris/shared`              | Domain schemas/types, site config, slugify, post dates (no `marked` / HTML / OpenAPI / Dynamo) |
| `@gagnechris/shared/render`       | Markdown + HTML prerender helpers (web / publisher)                                            |
| `@gagnechris/shared/openapi`      | OpenAPI document builder (build-time only)                                                     |
| `@gagnechris/shared/openapi.json` | Generated OpenAPI document (api-client `generate`)                                             |

DynamoDB helpers live in `@gagnechris/data` (not a shared subpath).

CI runs `npm run check:rn-bundles` (esbuild metafile + explicit ban list) so every RN-facing entry (`shared` domain, `api-client`, `app-core`, `tokens`) cannot pull banned modules. `npm run check:platform-neutral-lint` verifies ESLint `no-restricted-imports` bans. Metro import is verified by the Expo spike (CHR-142).

## Related

- CDK / ops: [../infra/RUNBOOK.md](../infra/RUNBOOK.md)
- Local stack: [local-e2e.md](./local-e2e.md)
- Project overview: [README.md](./README.md)
