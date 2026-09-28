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
- `PublishableKeyedRepository` / `PublishableSingletonRepository` — draft `META` + optional `PUBLISHED` snapshot (posts / home / resume). Publish, unpublish, discard, and `hasUnpublishedChanges` live here once.
- Posts keep slug claims and tag-index side effects in `posts/mutation-builders.ts`.

Mutating admin endpoints accept the client's expected `version`; 409 responses include `currentVersion` and `current`.

Details: [data-model.md](./data-model.md).

## Publisher outputs

On relevant stream events the publisher updates, among others:

- `/index.html`, `/resume/index.html`, `/blog/<slug>/index.html` (prerendered pages)
- `/blog/posts.json`, `/rss.xml`, `/sitemap.xml`
- `/resume.pdf` (pdf-lib + Inter fonts)
- CloudFront KeyValueStore keys for known published slugs
- Targeted CloudFront invalidations

The Vite `apps/web` build produces the SPA shell and admin chunks; it does **not** generate the sitemap/RSS/posts index.

## Admin data layer (TanStack Query)

Admin routes (`AdminLayout`) wrap children in `AdminQueryProvider` (`@tanstack/react-query`). Public pages stay outside Query so the public bundle stays lean.

- Query-key factories and UI-free hooks live under `apps/web/src/admin/query/` (keys, api helpers, posts/home/resume hooks, optimistic helpers) so they can later move to app-core.
- List/detail queries replace hand-rolled `useEffect` loading; mutations update or remove related cache entries (e.g. publish/delete updates the posts list without a manual refetch).
- Autosave still uses `useQueuedAutosave`; on success it writes the entity into the Query cache.
- Optimistic update + rollback pattern: `optimisticMutationHandlers` in `apps/web/src/admin/query/optimistic.ts` (ready for Notebook tasks).

## Admin editor foundation

Post, Home, and Resume editors share one publish/discard flow and a small UI kit:

- `useQueuedAutosave` + `useDraftPublishEditor` (autosave return passed as one `autosave` object; hold → busy → try/finally via `withHold`)
- `useDraftUpdater` / `useNullableDraftUpdater` for draft edits (`bumpEdit` + dirty)
- UI primitives in `apps/web/src/ui/`: `Button`, `Field`/`TextArea`, `StatusBadge`, `SaveIndicator`, `EditorActionBar`, `Repeater` (stable ids), `navLinkClass`
- Post editor splits container (`PostEditorPage`) from presentational sections and `uploadImages` (uses shared `MEDIA_CONTENT_TYPES`)

## 404 handling

- Unknown / unpublished **blog slugs**: viewer-request checks KVS; miss → `/404.html` (not S3 `NoSuchKey` XML), once `__synced__` exists.
- Soft-deleted / unpublished posts: publisher removes objects and clears the KVS entry so subsequent requests 404 cleanly.
- Other unknown public paths: viewer-request rewrites to `/404.html` (not the home page).
- Admin client routes under `/spa.html`: React Router `NotFound` for unmatched paths.

## Auth

- Production admin: Cognito Hosted UI / passkeys (`VITE_COGNITO_*`). Callback at `/auth/callback`.
- Local: `VITE_AUTH_MODE=local` fakes a signed-in session; production builds refuse this flag.
- API authorizer validates Cognito JWTs for `/api/admin/*` (and related) routes.
- Local API (`services/api/local/server.ts`) injects fake JWT claims **only** on `/api/admin/*` paths (mirroring API Gateway), so public routes still exercise the missing-auth path.

## How to add an API route

1. Add a `RouteDef` in the owning module (e.g. `createPostRoutes` in `services/api/src/posts/handlers.ts`) or append to `services/api/src/routes.ts`.
2. Pattern is **without** the `/api` prefix (`/admin/posts/:id`, `/contact`). Incoming `/api/...` is stripped by the router.
3. Set `auth: 'admin' | 'public'`, optional zod `params` / `query` / `body`, and a handler `(ctx, input) => result`.
4. Handlers receive `ctx.userId`, `ctx.claims`, `ctx.logger`, `ctx.metrics`, and `ctx.requestId`. Do **not** add per-module try/catch — validation and `mapRouteError` run in `dispatchRoutes`.
5. Wrong method on a known path → **405**; unknown path → **404**. Per-route metrics use a `route` dimension.

## `@gagnechris/shared` entry points (CHR-139)

| Import                         | Contents                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `@gagnechris/shared`           | Domain schemas/types, site config, slugify, post dates (no `marked` / HTML / OpenAPI / Dynamo) |
| `@gagnechris/shared/render`    | Markdown + HTML prerender helpers (web / publisher)                                            |
| `@gagnechris/shared/openapi`   | OpenAPI document builder (build-time only)                                                     |
| `@gagnechris/shared/server`    | DynamoDB helpers (API / publisher)                                                             |
| `@gagnechris/shared/home` etc. | Zod-free HTML entry points for the public web bundle                                           |

CI runs `npm run check:domain-bundle -w @gagnechris/shared` (esbuild metafile) so the domain entry cannot pull banned modules. Metro import is verified by the Expo spike (CHR-142).

## Related

- CDK / ops: [../infra/RUNBOOK.md](../infra/RUNBOOK.md)
- Local stack: [local-e2e.md](./local-e2e.md)
- Project overview: [README.md](./README.md)
