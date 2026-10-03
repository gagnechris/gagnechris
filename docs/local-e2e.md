# Local E2E stack

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
7. Asserts `/posts/<slug>` returns prerendered HTML + OG tags, that `/blog/<slug>` 301s to it, and that orphans / unpublished pages 404

## Browser tests (Playwright)

```bash
npx playwright install chromium webkit   # once per Playwright version
npm run e2e:browser                      # headless, Chromium + WebKit
npm run e2e:browser -- --ui              # interactive UI mode
npm run e2e:browser -- --project=webkit --headed tests/admin-posts.spec.ts
```

`e2e/global-setup.ts` boots a private stack for each run and tears it down
afterwards:

1. DynamoDB Local in its own container (`gagnechris-e2e-<run>`, label
   `gagnechris.e2e=1`, bound to `127.0.0.1` only), table
   `gagnechris-e2e-<run>`
2. Site root `e2e/.stack/<run>/site`, seeded from `apps/web/dist` when a
   build exists, else `scripts/local/minimal-shell.html`
3. Local API + publisher (`services/api/local/server.ts`), static site
   (`static-server.ts`) and Vite admin with `VITE_AUTH_MODE=local`

Every port is picked by the OS unless set, so a run never collides with
`npm run local:dev` (8000/8787/4177/5173), another worktree, or another run.
No Compose project is used.

| Env                     | Default                                              |
| ----------------------- | ---------------------------------------------------- |
| `E2E_DYNAMODB_PORT`     | free port                                            |
| `E2E_DYNAMODB_ENDPOINT` | unset; when set, reuse that DynamoDB                 |
| `E2E_API_PORT`          | free port                                            |
| `E2E_SITE_PORT`         | free port                                            |
| `E2E_VITE_PORT`         | free port                                            |
| `E2E_OUTPUT_DIR`        | `e2e/` (holds `test-results/`, `playwright-report/`) |

Playwright wipes its output dir on start, so give concurrent runs in the
same checkout different `E2E_OUTPUT_DIR`s. Process logs go to
`e2e/.stack/<run>/*.log`; they are deleted after a local run and kept in CI.
If a run is killed hard, remove leftovers with
`docker rm -f $(docker ps -q --filter label=gagnechris.e2e=1)` (only when no
other run is active).

### Writing specs

Import `test` and `expect` from `e2e/fixtures.ts`:

| Fixture  | What it gives you                                                          |
| -------- | -------------------------------------------------------------------------- |
| `prefix` | Unique per test; slugs and titles from `seed` start with it                |
| `users`  | `owner` and `other`, two distinct admins (`sub` = `<prefix>-owner/-other`) |
| `signIn` | `await signIn(user?)` before `page.goto`; defaults to `users.owner`        |
| `pageAs` | `await pageAs(user)` returns a page in a separate signed-in context        |
| `seed`   | API seeding as `users.owner` (`seed.post()`, `seed.note()`, `seed.api`)    |
| `seedAs` | `seedAs(user)` seeds as another user                                       |

Fake sign-in writes `{ userId, label }` to `localStorage['gagnechris.localAuthUser']`.
In `VITE_AUTH_MODE=local` the admin reads that user (default `local-dev-user`)
and sends `Authorization: Bearer local:<userId>`; the local API turns that
into ID-token claims with `sub=<userId>` for the matched route's app
(`site-admin` on `/api/admin`, `notebook` on `/api/notebook`), so
owner-scoped notebook data is separate per user. Any other bearer, or none, is the default user.

All tests share one stack and table, so isolate by `prefix` and per-test
users rather than assuming an empty table. Seeding goes through the API
(`@gagnechris/api-client`), so it hits the same validation as the UI.

### CI

The **Local E2E smoke (CHR-82)** job runs `npm run e2e:local`, then installs
cached Chromium + WebKit (`~/.cache/ms-playwright`, keyed by Playwright
version) and runs `npm run e2e:browser`. On failure it uploads the
`playwright-report-<attempt>` artifact: HTML report, `test-results/`
(traces, screenshots, video) and stack logs. Open a trace with
`npx playwright show-trace <trace.zip>` or the HTML report's trace viewer.

## Day-to-day local admin

One terminal:

```bash
npm run local:dev
```

This starts DynamoDB Local (if needed), bootstraps `gagnechris-local`, seeds a publisher shell, runs the API wrapper (`:8787`) and static origin (`:4177`), rebuilds published HTML, and starts Vite with `VITE_AUTH_MODE=local`. Vite proxies `/api` → API, and `/__site` and `/resume.pdf` → static origin (which applies the prod CloudFront viewer-request routing).

Open `http://localhost:5173/admin`. After publish, **View live** / `/posts/<slug>` uses the Vite SPA (with HMR). `PostPage` loads publisher HTML via `/__site/posts/<slug>/` (proxied to `:4177`). Ctrl+C stops Vite and processes this script started (Docker stays up).

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
asserts both halves: `/` has the home prerender and `/posts/<slug>` does not.

Lower-level scripts (`local:up`, `local:api`, `local:site`, …) run the pieces separately.

### Safety

| Guard                  | Behavior                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| Default Vite `/api`    | Proxies to `http://127.0.0.1:8787`, not prod                       |
| `VITE_API_TARGET=prod` | Opt-in only; admin shows a **PRODUCTION** banner                   |
| `scripts/local/env.sh` | Fake `AWS_*` keys, unsets `AWS_PROFILE`, table `gagnechris-local`  |
| Bootstrap / local API  | Refuse `DATA_TABLE_NAME=gagnechris-prod`                           |
| `VITE_AUTH_MODE=local` | Fake session in Vite; **production `vite build` fails** if set     |
| Lambda bundle          | Entry is only `services/api/src/handler.ts` — no auth bypass there |

Prod admin: `npm run dev:prod-api` (explicit + banner).

## Layout

| Path                                  | Role                                                    |
| ------------------------------------- | ------------------------------------------------------- |
| `docker-compose.local.yml`            | Official DynamoDB Local image                           |
| `scripts/local/dev.sh`                | One-command admin (`npm run local:dev`)                 |
| `scripts/local/env.sh`                | Safe env (source before local tools)                    |
| `scripts/local/bootstrap-table.ts`    | Create `gagnechris-local` + GSIs                        |
| `scripts/local/seed-shell.sh`         | Copy `apps/web/dist` → `.local-site`                    |
| `scripts/local/e2e.sh`                | Automated smoke (`npm run e2e:local`)                   |
| `scripts/local/minimal-shell.html`    | Publisher shell when `apps/web/dist` is missing         |
| `e2e/`                                | Playwright config, stack global setup, fixtures, specs  |
| `services/api/local/server.ts`        | HTTP → Lambda handler + publisher rebuild               |
| `services/api/local/static-server.ts` | Serves `.local-site` with real CF viewer-request        |
| `.local-site/`                        | Filesystem stand-in for the S3 site bucket (gitignored) |

Publisher uses `SITE_STORAGE=filesystem` locally; the prod Lambda uses S3 + CloudFront invalidation.
