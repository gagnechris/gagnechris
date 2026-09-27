# Architecture

Personal site + headless CMS on AWS. Public pages are **statically prerendered** into S3 and served by CloudFront. The React admin talks to a Lambda API over API Gateway; publish writes update DynamoDB, which triggers a publisher Lambda that rebuilds HTML/PDF/feeds and invalidates CloudFront.

## Request flow

1. **Browser → CloudFront** (`gagnechris.com`)
2. **Viewer request** CloudFront Function:
   - `/api/*` → API Gateway origin
   - `/blog/<slug>/` → rewrite to S3 object; unknown published slugs (KeyValueStore miss) → soft-404 HTML without hitting S3 XML errors
   - SPA routes (`/`, `/resume`, `/admin`, …) → `index.html` (or prerendered home/resume HTML when present)
3. **Viewer response** sets security headers / cache behavior as configured in CDK
4. **S3** holds the site objects (prerendered HTML, assets, `posts.json`, `rss.xml`, `sitemap.xml`, `resume.pdf`)
5. **API Gateway → Lambda API** for CRUD, publish, contact, resume download notify
6. **DynamoDB** single table (`gagnechris-prod`); Streams (`NEW_AND_OLD_IMAGES`) feed the publisher
7. **Publisher Lambda** renders markdown → HTML, regenerates index feeds/PDF, syncs published slug KeyValueStore, invalidates CloudFront paths
8. **Cognito** (passkeys) protects admin routes; **SES** sends contact and download notifications

## Draft vs published

| Concern | Behavior |
| --- | --- |
| Admin autosave | Writes **draft** items only (`META` / draft home & resume). Live site unchanged. |
| Publish | Writes a **live snapshot** (`PUBLISHED` for posts; published home/resume). Stream filter is snapshot-only so draft edits never invoke the publisher. |
| Unpublish / soft-delete | Removes the live snapshot; publisher removes HTML and updates feeds/KVS. |
| Optimistic concurrency | `version` on entities; conflicting publishes return 409. |

Details: [data-model.md](./data-model.md).

## Publisher outputs

On relevant stream events the publisher updates, among others:

- `/`, `/resume`, `/blog/<slug>/index.html` (prerendered pages)
- `/blog/posts.json`, `/rss.xml`, `/sitemap.xml`
- `/resume.pdf` (pdf-lib + Inter fonts)
- CloudFront KeyValueStore keys for known published slugs
- Targeted CloudFront invalidations

The Vite `apps/web` build produces the SPA shell and admin chunks; it does **not** generate the sitemap/RSS/posts index.

## 404 handling

- Unknown **blog slugs**: viewer-request checks KVS; miss → site 404 HTML (not S3 `NoSuchKey` XML).
- Soft-deleted / unpublished posts: publisher removes objects; KVS entry cleared so subsequent requests 404 cleanly.
- SPA unknown paths: client `NotFound` route after `index.html` fallback.

## Auth

- Production admin: Cognito Hosted UI / passkeys (`VITE_COGNITO_*`). Callback at `/auth/callback`.
- Local: `VITE_AUTH_MODE=local` fakes a signed-in session; production builds refuse this flag.
- API authorizer validates Cognito JWTs for `/api/admin/*` (and related) routes.

## Related

- CDK / ops: [../infra/RUNBOOK.md](../infra/RUNBOOK.md)
- Local stack: [local-e2e.md](./local-e2e.md)
- Project README: [../.github/README.md](../.github/README.md)
