# Local E2E stack (CHR-75)

Run the Blog CMS API + publisher against **DynamoDB Local** and a filesystem site root. No AWS profile, no `gagnechris-prod`, no CloudFront.

## Prerequisites

- Docker (for DynamoDB Local)
- Node.js 22.12+ (see `.nvmrc`)
- Repo dependencies: `npm ci`

## One-shot smoke

```bash
npm run e2e:local
```

This script:

1. Starts DynamoDB Local (`docker-compose.local.yml`)
2. Creates table `gagnechris-local` (idempotent)
3. Builds the web app if `apps/web/dist` is missing (Cognito placeholders)
4. Seeds `.local-site/` from that build (publisher shell)
5. Starts the local API wrapper (`:8787`) and static server (`:4177`)
6. Creates → publishes → edits (live unchanged) → publish changes (live updated) → unpublishes a post
7. Asserts `/blog/<slug>` returns prerendered HTML + OG tags, and that orphans / unpublished pages 404

## Day-to-day local admin

One terminal:

```bash
npm run local:dev
```

This starts DynamoDB Local (if needed), bootstraps `gagnechris-local`, seeds a publisher shell, runs the API wrapper (`:8787`) and static origin (`:4177`), rebuilds published HTML, and starts Vite with `VITE_AUTH_MODE=local`. Vite proxies `/api` → API and `/blog` → static origin (same as prod CloudFront Option B).

Open `http://localhost:5173/admin`. After publish, **View live** / `/blog/<slug>` uses the Vite SPA (with HMR). `BlogPost` loads publisher HTML via `/__site/blog/<slug>/` (proxied to `:4177`). Ctrl+C stops Vite and processes this script started (Docker stays up).

Optional: `npm run build && npm run local:seed-shell` once if you want full SPA assets in the publisher shell.

### Resume CMS

`http://localhost:5173/admin/resume` edits the singleton resume draft. The first
`GET` seeds a **draft** from `DEFAULT_RESUME` (no live rebuild). Publish copies
the draft to the `PUBLISHED` snapshot and rebuilds
`.local-site/resume/index.html` + `.local-site/resume.pdf`. Autosave updates the
draft only. The public page at `http://localhost:5173/resume` fetches
`/__site/resume/` and falls back to `DEFAULT_RESUME` when no published HTML
exists. Download uses `/resume.pdf` (Vite proxies that path to the local site
origin).

### Home CMS

`http://localhost:5173/admin/home` edits the header (name + title) and the
About Me copy. Like the resume, the first `GET` seeds a **draft** and does not
rebuild. Publish writes the `PUBLISHED` snapshot so `.local-site/index.html`
gets the `home-page-prerender` article. The public page at
`http://localhost:5173/` fetches `/__site/` and falls back to `DEFAULT_HOME`.
Quick Links and footer links come from shared `HOME_QUICK_LINKS` /
`HOME_FOOTER_LINKS` (React JSX + publisher HTML).

The publisher reads a pristine `_shell.html` template (never the home
prerender in `index.html`) when building other pages. `npm run e2e:local`
asserts both halves: `/` has the home prerender and `/blog/<slug>` does not.

Lower-level scripts (`local:up`, `local:api`, `local:site`, …) remain available if you want to run pieces separately.


### Safety

| Guard | Behavior |
| --- | --- |
| Default Vite `/api` | Proxies to `http://127.0.0.1:8787`, not prod |
| `VITE_API_TARGET=prod` | Opt-in only; admin shows a **PRODUCTION** banner |
| `scripts/local/env.sh` | Fake `AWS_*` keys, unsets `AWS_PROFILE`, table `gagnechris-local` |
| Bootstrap / local API | Refuse `DATA_TABLE_NAME=gagnechris-prod` |
| `VITE_AUTH_MODE=local` | Fake session in Vite; **production `vite build` fails** if set |
| Lambda bundle | Entry is only `services/api/src/handler.ts` — no auth bypass there |

Prod admin still: `npm run dev:prod-api` (explicit + banner).

## Layout

| Path | Role |
| --- | --- |
| `docker-compose.local.yml` | Official DynamoDB Local image |
| `scripts/local/dev.sh` | One-command admin (`npm run local:dev`) |
| `scripts/local/env.sh` | Safe env (source before local tools) |
| `scripts/local/bootstrap-table.mjs` | Create `gagnechris-local` + GSIs |
| `scripts/local/seed-shell.sh` | Copy `apps/web/dist` → `.local-site` |
| `scripts/local/e2e.sh` | Automated smoke (`npm run e2e:local`) |
| `services/api/local/server.ts` | HTTP → Lambda handler + publisher rebuild |
| `services/api/local/static-server.ts` | Serves `.local-site` with real CF viewer-request |
| `.local-site/` | Filesystem stand-in for the S3 site bucket (gitignored) |

Publisher uses `SITE_STORAGE=filesystem` locally; prod Lambda still uses S3 + CloudFront invalidation.
