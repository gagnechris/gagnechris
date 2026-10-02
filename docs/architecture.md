# Architecture

Personal site + headless CMS on AWS. Public pages are **statically prerendered** into S3 and served by CloudFront. The React admin talks to a Lambda API over API Gateway; publish writes update DynamoDB, which triggers a publisher Lambda that rebuilds HTML/PDF/feeds and invalidates CloudFront.

## Request flow

1. **Browser → CloudFront** (`gagnechris.com`)
2. **Viewer request** CloudFront Function:
   - `/api/*`, `/media/*`, and `/.well-known/*` → pass through (API Gateway / media / AASA+webauthn; CHR-177)
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

- `VersionedEntityRepository` — optimistic concurrency + cursor queries (id-keyed; used by publishable posts/home/resume).
- `OwnerScopedVersionedEntityRepository` — same concurrency model with `(userId, id)` keys, owner checks, per-index cursors, optional unique claims (daily notes), and GSI stripping on tombstones (CHR-169; Notebook notes/tasks).
- `PublishableRepository` / `PublishableSingletonRepository` — draft `META` + optional `PUBLISHED` snapshot (posts / home / resume). Publish, unpublish, discard, and `hasUnpublishedChanges` live here once.
- Posts keep slug claims and tag-index side effects in `posts/mutation-builders.ts`.

Mutating admin endpoints accept the client's expected `version`; 409 responses include `currentVersion` and `current`.

Integrity notes (CHR-160 / CHR-167):

- Corrupt `PUBLISHED` rows parse through `mapItem` → HTTP **500** `data_integrity` (not 400).
- Publisher treats corrupt resume/post rows as **preserve artifacts** (do not delete live HTML/PDF); emits `DataIntegrityError` metric and logs `pk`/`sk`.
- Corrupt post slugs stay in the KVS allowlist, `slugs.json`, and sitemap so kept HTML remains reachable; stream NewImages merge into the catalog so GSI lag cannot drop a just-published post (CHR-167).
- `SiteStorage.delete` is idempotent (`false` when already gone) so quiet rebuilds do not force CloudFront invalidation.
- Publisher base-table reads and API 409 conflict re-reads use `ConsistentRead: true`.
- List cursors require an exact key set with string values; GSI cursors must match the queried `gsi1pk` status partition. Sync/list cursors that escape their partition or `since` bound return **400** (CHR-170).
- Mutation pre-reads use `ConsistentRead` so queued autosave does not 409 on a stale eventually-consistent `current` (CHR-170).
- Stale version + taken slug prefers a version **409** with `current` over bare `slug_taken` (CHR-170).
- Admin autosave branches on `error === 'slug_taken'` vs version conflict.

Observability (CHR-168): handled API 500s emit EMF `HandlerError` (Lambda `Errors` stays quiet). Alarms on the Guardrails SNS topic cover API `HandlerError` / `DataIntegrityError`, publisher `DataIntegrityError`, API Gateway `5xx`, and DynamoDB AppTable `SystemErrors` / `ThrottledRequests`. Response-schema Zod failures are 500s; request Zod stays 400.

Details: [data-model.md](./data-model.md).

## Publisher outputs

Stream scope (`collectRebuildScope`) selects **publish targets** under
`services/publisher/src/publish-targets/targets/*.target.ts`. Each target is
listed in the explicit `publishTargets` array in `publish-targets/registry.ts`
(esbuild bundles those imports). Targets return `{ artifacts, deleteKeys,
invalidationPaths }`; the orchestrator writes, deletes, and invalidates.
CloudFront KeyValueStore slug sync remains a post-step after invalidation
(CHR-123 order).

**Adding a page:** one new `*.target.ts` plus one registry entry. Prefer matching
existing scope flags (`home`, `feeds`, …) or `touchedEntityTypes` for a page
with its own Dynamo entity — no new `RebuildScope` boolean. `collectRebuildScope`
records every PUBLISHED `entityType` in `touchedEntityTypes` (including types
that are not yet known flags); unknown types still do not set home/resume/feeds
(CHR-128 / CHR-166).

Invalidation is target-owned: a body-only post edit that does not change feed
artifacts will not re-invalidate `/rss.xml` or `/sitemap.xml` when those files
are unchanged (hash-skip / no feed rewrite). That is intentional after CHR-157.

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
- `createVersionedResource` builds query + setCache + update (+ optional delete) from config. Publishable entities layer `createDraftPublishResource` for publish / unpublish / discard (post / home / resume). Non-publishable entities (e.g. Notebook notes) use the versioned resource alone — not “config only” on the draft/publish factory.
- `useVersionedDocEditor` owns hydrate-once, version binding, performSave, autosave, remote-conflict detection, and delete-with-hold (no DOM, no `status`). `useVersionedEntityEditor` layers draft/publish lifecycle on top for post / home / resume. The web shell (`useVersionedDocShell`) adds confirm / leave-guards / ⌘S, with ⌘⏎ optional via `publishRef`.
- List/detail queries replace hand-rolled `useEffect` loading; mutations update or remove related cache entries (e.g. publish/delete updates the posts list without a manual refetch).
- Autosave still uses `useQueuedAutosave`; on success it writes the entity into the Query cache.
- Optimistic update + rollback: `optimisticMutationHandlers` supports one key or `targets[]` for multi-key snapshot/rollback (Notebook Today + Tasks).
- Typed HTTP client: `@gagnechris/api-client` with injectable `TokenProvider` (web passes Amplify `getIdToken`; public calls omit the token). Admin pages use `useGetApiClient()` / resource hooks — not per-call `createApiClient()` wrappers.
- Design tokens: `@gagnechris/tokens` (TS) generates `variables.css` imported by the web app. `text` / `space` / `radius` are px numbers for RN; the generator emits `rem` (`npm run tokens:check` guards drift).
- Mobile spike: `apps/mobile` (Expo) imports shared / api-client / app-core / tokens under Metro. Outside the root workspaces with its own lockfile, and CI executes a real Metro bundle — see `docs/mobile.md` (CHR-142, CHR-150).

## Admin editor foundation

Post, Home, and Resume containers are mostly field layout; shared wiring lives in app-core. Notebook notes (and other non-publishable docs) use the versioned-doc path without a publish layer:

- `createVersionedResource` + `useVersionedDocEditor` (hydrate, version, autosave, conflict, delete-with-hold)
- `createDraftPublishResource` + `useVersionedEntityEditor` (layers publish / unpublish / discard on the doc editor)
- `useQueuedAutosave` + shared `withHold` from the doc editor (`useDraftPublishEditor` consumes it for lifecycle actions)
- Web shell `apps/web/src/admin/useVersionedDocShell.ts` adds leave guards and ⌘S; `useVersionedEntityEditor.ts` injects confirm and optional ⌘⏎ via `publishRef`
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
- Local API (`services/api/local/server.ts`) injects fake JWT claims when the matched route has `auth: 'admin'` (via `pathRequiresAdminAuth`) — same rule as production route auth, not a hard-coded path prefix. Malformed `%` escapes do not throw in that check so the handler can still return **400**.

## Notebook sync contract (CHR-153 / CHR-162 / CHR-172)

`GET /api/notebook/sync/changes` is the generic change feed real Notebook entities will use:

- **Client ULID** on create; retries with the same id + matching **create-time** payload hash (`createHash`, includes `userId`) are idempotent (mismatch → 409). A durable owner-scoped `CREATED#<TYPE>#USER#<sub>#<id>` claim (TTL ≫ tombstone TTL) prevents offline create replays from resurrecting an entity after META TTL purge. Soft-delete **extends** the claim TTL from delete time. Rows without `createHash` cannot prove create-time identity and return **409** `payload_mismatch`.
- **One sync row per entity** via sparse GSI3 (`syncPk` / `syncSk` on META). Soft delete sets `deleted=true`, bumps `version`, and sets item `ttl` (~30 days). `entityType` is stamped from sync config on every write.
- **Adapters** come from `config.sync.toChange` (registered when the repository is constructed). Missing adapters log + emit `SyncAdapterMissing`; a unit test fails if a synced fixture has no adapter.
- **Typed `SyncChange`**: OpenAPI/client use a discriminated union on `type` (today: `fakeNote` fixture; Note/Task variants land with those entities).
- **`since` / `nextSince`**: `nextSince` is an ISO-8601 server watermark (treat as opaque; echo as `since`). Overlap window `SYNC_OVERLAP_MS` (15s ≥ API Lambda timeout); clients dedupe by `(id, version)`. **`since` older than `now − SYNC_TOMBSTONE_TTL_DAYS − SYNC_RESYNC_MARGIN_MS` → 410 `resync_required`** (full resync). Omit `since` for a full feed.
- **Paging**: default `limit` is 50 (max 100). No batch mutate endpoint — clients apply changes one-by-one.
- **`updatedAt` is server-stamped**; clients must not rely on client clocks for ordering.
- **Throttle**: stage default 20 rps / 50 burst; notebook routes 50/100; public contact and resume-download 5/10. API Gateway 429 bodies are `{"message":…}` (not `ErrorResponse`) — retry with backoff and refresh Cognito tokens before a long offline catch-up.
- **Optimistic concurrency**: responses include strong `ETag: "<version>"`. Mutations accept `If-Match` or body `version` (helpers in `services/api/src/data/versioned-route.ts` / `concurrency.ts`):
  - `If-Match: "<n>"` or weak `If-Match: W/"<n>"` — expect version `n`; mismatch → **412** (`precondition_failed`) with `currentVersion` + `current`
  - `If-Match: *` — resource must exist; server applies the mutation against the current version (missing → **404**)
  - Malformed `If-Match` → **400**
  - Body-only `version` mismatch → **409** (`version_conflict`) with `currentVersion` + `current`
- **409 `error` codes** (machine-readable): `version_conflict`, `deleted`, `payload_mismatch`, `slug_taken`, `daily_taken` (plus legacy `conflict`).

### API versioning policy (sync contract v1)

- OpenAPI info version tracks the HTTP contract (currently `0.3.0`). Sync feed changes are **additive only** until a major bump: new `SyncChange` variants, optional fields, new query params with defaults.
- Clients must **tolerant-decode**: ignore unknown `type` values and unknown entity fields.
- A future `X-Client-Version` / minimum-client gate may return **426**; until then there is no min-client header.
- On **410 `resync_required`**, discard tombstone-dependent local state and re-fetch with no `since`.

Fixture-note spike **routes** stay test-only (CHR-153); the `fakeNote` SyncChange variant remains in the OpenAPI union as the typed contract fixture until Note/Task ship. Details: [data-model.md](./data-model.md).

## How to add an API route

1. Add a `defineRoute({ … })` in the owning module (e.g. `createPostRoutes` in `services/api/src/posts/handlers.ts`) or append to `services/api/src/routes.ts`. Prefer `defineRoute` so `params` / `query` / `body` schemas type the handler input (no casts).
2. Pattern is **without** the `/api` prefix (`/admin/posts/:id`, `/contact`). Incoming `/api/...` is stripped by the router.
3. Set `auth: 'admin' | 'public'`, optional zod `params` / `query` / `body`, and a handler `(ctx, input) => result`.
4. Handlers receive `ctx.userId`, `ctx.claims`, `ctx.logger`, `ctx.metrics`, and `ctx.requestId`. Do **not** add per-module try/catch — validation and `mapRouteError` run in `dispatchRoutes`.
5. Wrong method on a known path → **405** with an `Allow` header; unknown path → **404**. Malformed `%` escapes in path params → **400**. When multiple patterns match, **literal segments win** over `:param` (e.g. `/tasks/today` over `/tasks/:id`).
6. Per-route CloudWatch metrics use the route `metric` name (no redundant `route` dimension).
7. Keep these three places in sync (CI/tests assert agreement):
   - **Route table** `auth: 'admin'` patterns must live under `/admin` or `/notebook` (`API_GATEWAY_JWT_PREFIXES` in `services/api/src/router.ts`). Public routes must **not** sit under those prefixes (gateway would 401).
   - **API Gateway** JWT routes in `infra/lib/stacks/api-stack.ts` (`/api/admin`, `/api/notebook` + `{proxy+}`) — asserted on the **synthesized** template (not source text): exactly those JWT `RouteKey`s, and no unauthenticated route under `/api/admin` or `/api/notebook`. Each `auth: 'public'` route needs its own `addRoutes` entry (method + `/api…` path); there is no `$default` catch-all.
   - **OpenAPI** operation in `packages/shared/src/openapi.ts` (same method + `/api…` path as `routePatternToOpenApiPath`). Request schemas belong in `@gagnechris/shared` and are reused by both the API and the spec. Versioned mutations document `If-Match` / `ETag` / **412** with `current`.
8. Local API (`services/api/local/server.ts`) injects fake JWT claims when the matched route has `auth: 'admin'` — it does not hard-code path prefixes.

## `@gagnechris/shared` entry points (CHR-139 / CHR-156 / CHR-164)

| Import                       | Contents                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@gagnechris/shared`         | Domain schemas/types, site config, slugify, post dates (no `marked` / HTML / OpenAPI / Dynamo)                           |
| `@gagnechris/shared/render`  | Markdown + HTML prerender helpers (web / publisher); also re-exports `/html` helpers                                     |
| `@gagnechris/shared/html`    | Leaf HTML escape/meta helpers only (no markdown). For Node/Vite config that cannot load `/render` (`.js` source imports) |
| `@gagnechris/shared/openapi` | OpenAPI document builder (build-time only)                                                                               |

`marked` remains a runtime dependency of the shared package because `/render` lives in the same package; the domain entry does not import it (enforced by `check:rn-bundles`). Prefer `/render` in app/publisher code; use `/html` only where the importer runs as native Node ESM against TypeScript sources (e.g. Vite plugins). The generated OpenAPI document lives at `packages/shared/openapi/openapi.json` and is read by path from `api-client` generate — there is no package export for it.

DynamoDB helpers live in `@gagnechris/data` (not a shared subpath).

CI runs `npm run check:rn-bundles` (esbuild metafile + exact-package externals + ban list) so every RN-facing entry (`shared` domain, `api-client`, `app-core`, `tokens`) cannot pull banned modules or shared subpaths. `npm run check:platform-neutral-lint` verifies ESLint `no-restricted-imports` / `no-restricted-globals` bans. Mobile CI also requires `zod/v4/` (not `zod/v3/`) in the iOS export sourcemap (CHR-164).

## Notebook attachments + deploy excludes (CHR-175)

**Public blog media (`/media/*`)** stays on the site bucket and CloudFront with long cache (CHR-31). It is the wrong place for Notebook attachments (private notes/tasks).

**Decision — private Notebook attachments:**

- Store objects in a **separate private S3 bucket** (or a non-CloudFront prefix that is never published as a public behavior). Not under `/media/*` on the site bucket.
- API issues **short-lived presigned GET/PUT** URLs after auth (`/api/notebook/...`). No public CloudFront cache for note attachments.
- Bucket encryption + block public access; optional KMS CMK later with the Backup vault CMK follow-up.

**`scripts/deploy-web.sh`:** uses `aws s3 sync --delete` with an exclude deny-list. Publisher-owned and reserved prefixes must stay excluded or the next web deploy deletes them. Current excludes include `blog/*`, `resume/*`, `home/*`, `media/*`, **`notebook/*`** (reserved for any future site-bucket notebook exports), `sitemap.xml`, `rss.xml`. When CHR-42 adds attachments, put bytes in the private bucket above — do not rely on `/media/*`.

**Backups:** AppTable has PITR plus an AWS Backup daily plan (see `infra/RUNBOOK.md`). Notebook data is not recreate-from-git the way posts are; treat Backup + rehearsed PITR restore as required before storing irreplaceable notes.

## Related

- CDK / ops: [../infra/RUNBOOK.md](../infra/RUNBOOK.md)
- Local stack: [local-e2e.md](./local-e2e.md)
- Project overview: [README.md](./README.md)
