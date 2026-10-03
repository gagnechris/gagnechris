# Architecture

Personal site + headless CMS on AWS. Public pages are **statically prerendered** into S3 and served by CloudFront. The React admin talks to a Lambda API over API Gateway; publish writes update DynamoDB, which triggers a publisher Lambda that rebuilds HTML/PDF/feeds and invalidates CloudFront.

## Request flow

1. **Browser → CloudFront** (`gagnechris.com`)
2. **Viewer request** CloudFront Function:
   - `/api/*`, `/media/*`, and `/.well-known/*` → pass through (API Gateway / media / AASA+webauthn; CHR-177)
   - `/blog` and `/blog/*` → 301 to the same path under `/posts` (CHR-206)
   - `/posts` and `/posts/*` → rewritten to the `/blog` S3 prefix. Posts are public at `/posts`, but the publisher still stores them under `blog/` (no S3 or KVS migration). Everything below sees the storage path.
   - `/` → `/index.html` (prerendered home)
   - Option B prefixes (publisher `optionBPaths` + Vite static `/contact`, `/dont-feed-the-bears`) → `{path}/index.html`
   - `/blog/<slug>` (public `/posts/<slug>`) → Option B only when the slug is in the CloudFront KeyValueStore; otherwise `/404.html` (avoids raw S3 XML). Until the publisher writes a `__synced__` sentinel, unknown slugs fail open (Option B for any slug).
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

**Adding a page:** one new `*.target.ts` plus one registry entry (CHR-179). Prefer
matching existing scope flags (`home`, `feeds`, …) or `touchedEntityTypes` for a
page with its own Dynamo entity — no new `RebuildScope` boolean.
`streamNeedsRebuild` asks registered targets’ `matches()` (so an own-entity
target wakes the real handler). Declare `optionBPaths` and
`adminMutationPrefixes` on the target; `npm run publish-surface:generate` folds
those into the CloudFront Option B allowlist and local-dev
`isPublishRelevantAdminMutation` routes (`publish-surface:check` guards drift).
Vite-only pages (`/contact`, `/dont-feed-the-bears`) stay in
`STATIC_OPTION_B_PREFIXES`. `collectRebuildScope` still records every PUBLISHED
`entityType` in `touchedEntityTypes`; unknown types do not set home/resume/feeds
(CHR-128 / CHR-166).

Invalidation is target-owned: a body-only post edit that does not change feed
artifacts will not re-invalidate `/rss.xml` or `/sitemap.xml` when those files
are unchanged (hash-skip / no feed rewrite). That is intentional after CHR-157.

On relevant stream events the publisher updates, among others:

- `/index.html`, `/resume/index.html`, `/blog/<slug>/index.html` (prerendered pages)
- `/blog/posts.json` (served at `/posts/posts.json`), `/rss.xml`, `/sitemap.xml`. Canonical, sitemap and RSS `<link>` URLs use `/posts`; RSS `<guid>`s keep the old `/blog/<slug>` URL so feed readers don't re-list posts.
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
- Autosave never drops typed text (CHR-189): unmounting an editor with unsaved edits (route change, Today re-keyed by date/area) flushes a save; the web leave-guard saves first and only asks to leave if that save fails. Network/408/429/5xx failures retry on a backoff (2 s → 60 s) and on injected `retrySignals` (web: `online`, focus, tab visible); 409/412 and other 4xx do not retry.
- `setCachedNote` / `setCachedTask` / `setCachedPost` share one filter-aware upsert: an entity is inserted only into list caches whose key filters it matches (area, type, date range, status / `open`, priority, due, note), and removed from ones it no longer matches; calendar `daily-dates` Sets update only for the matching area and month (CHR-189).
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
- API authorizer validates Cognito JWTs (web and iOS client audiences) for `/api/admin/*` and `/api/notebook/*` routes; the router then requires the `admin` group in `cognito:groups` (403 otherwise, CHR-195).
- Tokens live in Amplify `CookieStorage` (JS-readable, domain `gagnechris.com`, 30 days, refresh token included). HttpOnly storage would need a server-side token exchange that Amplify doesn't provide, so the mitigations are on the script side: sanitized markdown and a strict CSP on `/admin` and `/auth` (see Security headers). Shortening `refreshTokenValidity` (Auth stack, 30 days) is the remaining lever; it trades for more frequent sign-ins (CHR-193).
- Local API (`services/api/local/server.ts`) injects fake JWT claims when the matched route has `auth: 'admin'` (via `pathRequiresAdminAuth`) — same rule as production route auth, not a hard-coded path prefix. Malformed `%` escapes do not throw in that check so the handler can still return **400**.

## Admin Notebook shell (CHR-41 / CHR-42)

- Lazy `/admin/notebook/*` under the admin layout: section routes `today`, `notes`, `notes/:id`, `tasks` (index redirects to `today`).
- Layout chrome: Work / Personal / **All** area filter (UI-only; `'all'` omits `area` on list APIs) plus Today / Notes / Tasks nav. Area preference persists in `localStorage` (`gagnechris.notebook.areaFilter`).
- Child pages read the filter via React Router outlet context.
- **Today (CHR-42 / CHR-45):** calendar (dots from `useDailyNoteDatesQuery` / `daily-dates` keys — a `Set` of dates, not infinite list pages), prev/next/jump-to-today, daily editor keyed by area+date. Writing requires Work or Personal (All is list-only). Empty daily GETs become a client-ULID placeholder; first save uses daily PUT upsert. `setCachedNote` updates daily-dates Sets and skips non-infinite list cache entries so first-write autosave cannot throw a false conflict. Day changes push history entries (Back steps through days); the heading reads Today only for the current local day, which rolls over at midnight. Dashboard also shows overdue / due-today / in-progress tasks with quick-complete (failures show an error), a due-today progress bar, quick-add (defaults due today), and after 18:00 local a tomorrow preview.
- **Pages (CHR-42):** list + search by title, create page (client ULID), editor with title/tags/pin. Reuses `createVersionedResource` + `useVersionedDocEditor` + `useVersionedDocShell` (no publish) and the shared `MarkdownEditor` with `taskListToggle`. No public `/media` uploads for notes.
- **Tasks (CHR-44):** list with quick-add (`!high` anywhere; `today` / `tomorrow` only as the last word), status/priority/due filters, one-click complete (optimistic), collapsed completed section, and detail editor (markdown description + metadata) via `taskResource` + `useVersionedDocEditor`.
- **Search (CHR-46):** `POST /api/notebook/search` with a JSON body `{ q, area?, limit? }` (POST since CHR-196 so terms stay out of URLs and access logs) scans the user's notes/tasks in memory (no OpenSearch). ⌘K / Search in the notebook chrome opens a palette with notes/tasks groups, optional current-area filter, and highlighted snippets.
- **Export (CHR-47):** chrome **Export** builds a ZIP in the browser (store/no compression) from paged notes + tasks APIs: one Markdown file per note (YAML frontmatter) plus `tasks.json`. This is a human-readable backup/migration path, not Dynamo restore — infra PITR / AWS Backup stay in `infra/RUNBOOK.md`.
- **PWA (CHR-48):** `/spa.html` (served for `/admin/*`) links `manifest.json` (`start_url` `/admin/notebook`, `scope` `/admin/`, `display: standalone`) plus apple-touch / `apple-mobile-web-app-*` meta so iPhone Add to Home Screen opens full-screen. Icons under `/icons/`. Offline read-only cache is optional and not required for installability.

## Notebook sync contract (CHR-153 / CHR-162 / CHR-172)

`GET /api/notebook/sync/changes` is the generic change feed real Notebook entities will use:

- **Client ULID** on create; retries with the same id + matching **create-time** payload hash (`createHash`, `sha256:` of the fields including `userId`, never the text; CHR-192) are idempotent (mismatch → 409). Pre-CHR-192 rows hold the plaintext join until `scripts/migrate-create-hash.mjs` rewrites them; comparison accepts both forms. A durable owner-scoped `CREATED#<TYPE>#USER#<sub>#<id>` claim (TTL ≫ tombstone TTL) prevents offline create replays from resurrecting an entity after META TTL purge. Soft-delete **extends** the claim TTL from delete time. Rows without `createHash` cannot prove create-time identity and return **409** `payload_mismatch`.
- **One sync row per entity** via sparse GSI3 (`syncPk` / `syncSk` on META). Soft delete sets `deleted=true`, bumps `version`, and sets item `ttl` (~30 days). `entityType` is stamped from sync config on every write.
- **Adapters** come from `config.sync.toChange` (registered when the repository is constructed). Missing adapters log + emit `SyncAdapterMissing`; a unit test fails if a synced fixture has no adapter.
- **Typed `SyncChange`**: OpenAPI/client use a discriminated union on `type` (`note`, `task`, plus the `fakeNote` test fixture).
- **`since` / `nextSince`**: `nextSince` is an ISO-8601 server watermark (treat as opaque; echo as `since`). Overlap window `SYNC_OVERLAP_MS` (15s ≥ API Lambda timeout); clients dedupe by `(id, version)`. **`since` older than `now − SYNC_TOMBSTONE_TTL_DAYS − SYNC_RESYNC_MARGIN_MS` → 410 `resync_required`** (full resync). Omit `since` for a full feed.
- **Paging**: default `limit` is 50 (max 100). No batch mutate endpoint — clients apply changes one-by-one.
- **`updatedAt` is server-stamped**; clients must not rely on client clocks for ordering.
- **Throttle**: stage default 20 rps / 50 burst; notebook routes 50/100; public contact and resume-download 5/10. API Gateway 429 bodies are `{"message":…}` (not `ErrorResponse`) — retry with backoff and refresh Cognito tokens before a long offline catch-up.
- **Optimistic concurrency**: responses include strong `ETag: "<version>"`. Mutations accept `If-Match` or body `version` (helpers in `services/api/src/data/versioned-route.ts` / `concurrency.ts`):
  - `If-Match: "<n>"` or weak `If-Match: W/"<n>"` — expect version `n`; mismatch → **412** (`precondition_failed`) with `currentVersion` + `current`
  - `If-Match: *` — resource must exist; server applies the mutation against the current version (missing → **404**)
  - Malformed `If-Match` → **400**
  - Notebook note/task `PUT`, `DELETE`, and task `complete`/`reopen` accept `If-Match` **alone**: body `version` is optional when the header is present. With neither → **400**. `If-Match` wins when both are sent (CHR-186)
  - Every OpenAPI request body is `required`, so the typed client cannot call a mutation (e.g. a delete) without its body; the web sends body `version` on deletes
  - Notebook note/task mutations build the new row from a **strongly consistent** read inside the repository (`mutateIfVersion` / `softDeleteIfVersion`) and always write `expected + 1`, so a lagging replica can never revert unsent fields or reuse a version (CHR-188)
  - Body-only `version` mismatch → **409** (`version_conflict`) with `currentVersion` + `current`
- **409 `error` codes** (machine-readable): `version_conflict`, `deleted`, `payload_mismatch`, `slug_taken`, `daily_taken` (plus legacy `conflict`).

### API versioning policy (sync contract v1)

- OpenAPI info version tracks the HTTP contract (currently `0.3.0`). Sync feed changes are **additive only** until a major bump: new `SyncChange` variants, optional fields, new query params with defaults.
- Clients must **tolerant-decode**: ignore unknown `type` values and unknown entity fields.
- A future `X-Client-Version` / minimum-client gate may return **426**; until then there is no min-client header.
- On **410 `resync_required`**, discard tombstone-dependent local state and re-fetch with no `since`.

Fixture-note spike **routes** stay test-only (CHR-153); the `fakeNote` SyncChange variant remains in the OpenAPI union alongside `note` / `task`. Real notes HTTP routes live under `/api/notebook/notes*` (CHR-40); tasks under `/api/notebook/tasks*` (CHR-43), including `POST …/complete` and `…/reopen`. List responses are **server-sorted**: overdue first, then due date ascending, then priority (`high` → `med` → `low`). Details: [data-model.md](./data-model.md).

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

## Security headers and rendered HTML (CHR-193)

- `renderMarkdownToHtml` (`@gagnechris/shared/render`) runs `marked` output through `sanitize-html` with an allowlist: no scripts, iframes, forms, event handlers, inline styles, or `javascript:` / `data:` URLs. The admin previews and the publisher both use it, so pasted HTML is inert in the editor and on published pages.
- CloudFront has two response-header policies in the Site stack:
  - Public pages: GA4 hosts allowed, `script-src` keeps `'unsafe-inline'` for the gtag bootstrap.
  - `/admin*` and `/auth*`: `script-src 'self'` (no inline script, no Google hosts); `connect-src` is `'self'`, Cognito and the site bucket's regional host (presigned media PUTs). `spa.html` is built without the GA snippet so it runs under this policy.
- A CSP applies per document load: an admin page reached by in-app navigation from a public page keeps the public policy until reload.

## Privacy: logs, caching and IAM (CHR-196)

- **Search terms are not logged (decision).** CloudFront standard logging writes `cs-uri-query` to the `AccessLogs` bucket (`cloudfront/` prefix, expired after 90 days), and API Gateway access logs record the route and path. Search used `GET ...?q=`, so terms landed in both. Search is now `POST /api/notebook/search` with a JSON body; the GET route is gone (405 with `Allow: POST`). Request bodies are never in either log.
- **API logs carry no bodies or query values.** The Lambda logs `request` with the path only (no query string, no body); Powertools `logEvent` stays off. `services/api/test/request-logging.test.ts` runs the real handler and fails if a search term or a note create/update body appears on stdout/stderr.
- **Response headers.** The router adds `X-Content-Type-Options: nosniff` to every API response and `Cache-Control: no-store` to non-public routes and to every error (router 401/403/404/405, handler 500). Public successes (health, contact, resume notify) set no cache header. CloudFront `/api/*` has its own response headers policy (`api-security-headers`: nosniff, HSTS, `no-referrer`, and `Cache-Control: no-store` when the origin sent none), which covers responses API Gateway generates itself, such as JWT authorizer 401s and throttling 429s. The edge also stays `CACHING_DISABLED`.
- **CI read roles.** The diff, drift and CDK lookup roles run under `ReadOnlyAccess` with a `DenyPrivateDataReads` statement: DynamoDB item reads, S3 object reads, and log and trace reads (`logs:GetLogEvents`, `FilterLogEvents`, `StartQuery`, `GetQueryResults`, `StartLiveTail`, `GetLogRecord`, `Unmask`, `xray:BatchGetTraces`, `GetTraceSummaries`, `GetTraceGraph`). Logs hold no note content today; the deny keeps that true if a future log line slips. `cdk diff` / `cdk drift` never read logs.
- **Publisher is read-only on the table.** It writes nothing to DynamoDB. Its role allows `GetItem` / `BatchGetItem` on the table with `dynamodb:LeadingKeys` limited to `POST#*`, `HOME#*`, `RESUME#*`, and `Query` on `gsi1` limited to `STATUS#published` (for an index, LeadingKeys is the index partition key). Notebook (`USER#…`), contact and rate-limit partitions are out of reach. Stream read is a separate grant.
- **`execute-api` default endpoint (accepted risk).** CloudFront's `/api/*` origin is the `execute-api` hostname, so the default endpoint can't be disabled without a custom domain on the HTTP API. Calling it directly skips CloudFront (and its response headers policy), but the JWT authorizer, the admin-group check, API Gateway throttles and the Lambda's own headers still apply. A secret origin header checked by the API is the follow-up if this ever matters.

## Analytics stay off /admin and /auth (CHR-194)

- GA4 loads only in the public shells. `spa.html` (served for `/admin*` and `/auth*`) is built without it, and the Vite dev server strips it for those paths too (`devSpaShellPlugin`), so dev matches prod.
- `apps/web/src/utils/analytics.ts` never sends page views or events for a private path (`isPrivatePath` in `utils/privatePaths.ts`). `RouteTracker` also sets gtag's `ga-disable-<id>` flag while a private route is showing, which stops gtag's own enhanced-measurement hits if gtag is already loaded from an in-app navigation.

## `@gagnechris/shared` entry points (CHR-139 / CHR-156 / CHR-164)

| Import                       | Contents                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@gagnechris/shared`         | Domain schemas/types, site config, slugify, post dates (no `marked` / HTML / OpenAPI / Dynamo)                           |
| `@gagnechris/shared/render`  | Markdown + HTML prerender helpers (web / publisher); also re-exports `/html` helpers                                     |
| `@gagnechris/shared/html`    | Leaf HTML escape/meta helpers only (no markdown). For Node/Vite config that cannot load `/render` (`.js` source imports) |
| `@gagnechris/shared/openapi` | OpenAPI document builder (build-time only)                                                                               |

`marked` and `sanitize-html` remain runtime dependencies of the shared package because `/render` lives in the same package (the package is `sideEffects`-free apart from the OpenAPI extension, so pages that don't render markdown don't bundle them); the domain entry does not import it (enforced by `check:rn-bundles`). Prefer `/render` in app/publisher code; use `/html` only where the importer runs as native Node ESM against TypeScript sources (e.g. Vite plugins). The generated OpenAPI document lives at `packages/shared/openapi/openapi.json` and is read by path from `api-client` generate — there is no package export for it.

DynamoDB helpers live in `@gagnechris/data` (not a shared subpath).

CI runs `npm run check:rn-bundles` (esbuild metafile + exact-package externals + ban list) so every RN-facing entry (`shared` domain, `api-client`, `app-core`, `tokens`) cannot pull banned modules or shared subpaths. `npm run check:platform-neutral-lint` verifies ESLint `no-restricted-imports` / `no-restricted-globals` bans. Mobile CI also requires `zod/v4/` (not `zod/v3/`) in the iOS export sourcemap (CHR-164).

## Notebook attachments + deploy excludes (CHR-175)

**Public blog media (`/media/*`)** stays on the site bucket and CloudFront with long cache (CHR-31). It is the wrong place for Notebook attachments (private notes/tasks).

**Decision — private Notebook attachments:**

- Store objects in a **separate private S3 bucket** (or a non-CloudFront prefix that is never published as a public behavior). Not under `/media/*` on the site bucket.
- API issues **short-lived presigned GET/PUT** URLs after auth (`/api/notebook/...`). No public CloudFront cache for note attachments.
- Bucket encryption + block public access; optional KMS CMK later with the Backup vault CMK follow-up.

**`scripts/deploy-web.sh`:** uses `aws s3 sync --delete` with an exclude deny-list. Publisher-owned and reserved prefixes must stay excluded or the next web deploy deletes them. Current excludes include `blog/*`, `resume/*`, `home/*`, `media/*`, **`notebook/*`** (reserved for any future site-bucket notebook exports), `sitemap.xml`, `rss.xml`. When CHR-42 adds attachments, put bytes in the private bucket above — do not rely on `/media/*`.

**Backups:** AppTable has PITR plus an AWS Backup daily plan (see `infra/RUNBOOK.md`). Notebook data is not recreate-from-git the way posts are; treat Backup + rehearsed PITR restore as required before storing irreplaceable notes. Separately, the admin **Export** button (CHR-47) downloads markdown/JSON for human backup — it does not replace PITR.

## Related

- CDK / ops: [../infra/RUNBOOK.md](../infra/RUNBOOK.md)
- Local stack: [local-e2e.md](./local-e2e.md)
- Project overview: [README.md](./README.md)
