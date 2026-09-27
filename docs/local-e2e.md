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
6. Creates → publishes → edits → unpublishes a post
7. Asserts `/blog/<slug>` returns prerendered HTML + OG tags, and that orphans / unpublished pages 404

## Day-to-day local admin

```bash
# Terminal 1 — data plane
docker compose -f docker-compose.local.yml up -d
source scripts/local/env.sh
node scripts/local/bootstrap-table.mjs

# Terminal 2 — API (injects Cognito JWT claims; rebuilds site after mutating posts)
npm run local:api

# Terminal 3 — static origin (real viewer-request rewrite)
npm run build   # once, for shell + assets
npm run local:seed-shell
npm run local:site

# Terminal 4 — Vite (proxies /api → local; VITE_AUTH_MODE=local)
npm run dev:local
```

Open `http://localhost:5173/admin`. You are signed in as `local@gagnechris.com` without Cognito.

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
| `scripts/local/env.sh` | Safe env (source before local tools) |
| `scripts/local/bootstrap-table.mjs` | Create `gagnechris-local` + GSIs |
| `scripts/local/seed-shell.sh` | Copy `apps/web/dist` → `.local-site` |
| `scripts/local/e2e.sh` | Automated smoke (`npm run e2e:local`) |
| `services/api/local/server.ts` | HTTP → Lambda handler + publisher rebuild |
| `services/api/local/static-server.ts` | Serves `.local-site` with real CF viewer-request |
| `.local-site/` | Filesystem stand-in for the S3 site bucket (gitignored) |

Publisher uses `SITE_STORAGE=filesystem` locally; prod Lambda still uses S3 + CloudFront invalidation.
