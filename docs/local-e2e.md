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
4. Seeds `.local-site/` from that build (publisher shell) and fails if the built app fetches `/__site`, which only the Vite dev server proxies
5. Starts the local API wrapper (`:8787`) and static server (`:4177`)
6. Creates → publishes → edits (live unchanged) → publish changes (live updated) → unpublishes a post
7. Asserts `/posts/<slug>` returns prerendered HTML + OG tags, that `/blog/<slug>` 301s to it, and that orphans / unpublished pages 404
8. Creates and publishes a project and a bodyless `idea`; asserts `/projects/<slug>` is live, `/projects` lists both (the idea unlinked), Home lists the project but not the idea, and `sitemap.xml` lists only the project with a page; checks that tagging a post with an unknown project id is a 400, publishes a post tagged with the project and asserts it is in the project's Build log and shows "Part of", renames the project slug and asserts both still link; unpublishes the project and asserts its page, `/projects` and Home entries and sitemap entry are gone and the post no longer shows "Part of", then asserts that unknown page URLs (`/projects/x`, `/resume/x`, `/contact/x`, `/dont-feed-the-bears/x`, `/x.html`, an unpublished post or project, …) are the HTML 404 with status 404 and every real page is 200. Last, it starts a second static server whose viewer-response function marks responses and asserts a missing object comes back unmarked, since CloudFront never runs viewer-response on an origin 4xx

To run it beside another stack, give it its own Compose project and ports, e.g. `COMPOSE_PROJECT_NAME=mine DYNAMODB_LOCAL_HOST_PORT=28427 LOCAL_API_PORT=28787 LOCAL_SITE_PORT=28177 npm run e2e:local`, then `COMPOSE_PROJECT_NAME=mine docker compose -f docker-compose.local.yml down`.

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
3. Local API + publisher (`services/api/local/server.ts`) and static site
   (`static-server.ts`, `E2E_SITE_URL`), which runs the real apex
   viewer-request function and returns its redirects with their headers.
   The API runs one rebuild at a time and answers a publish only after its
   rebuild, so the item is in the site from then on; the filesystem storage
   replaces files by rename, so a page read mid-rebuild is never partial.
   The KeyValueStore is `e2e/.stack/<run>/kvs.json` (`LOCAL_KVS_FILE`),
   seeded with both sentinels so unknown slugs 404 as in prod.
   `tests/apex-cutover.spec.ts` checks the old apex `/admin*` and `/auth*`
   301s against it
4. One Vite dev server per app (public, admin, Notebook) with
   `VITE_AUTH_MODE=local`, each on its own port, so each app is its own
   origin as in prod. The public one sets `VITE_DEMO_FIXTURE=posts`, so a
   project with `demo: 'posts'` loads the test-only fixture demo there
   (`tests/public-project-page.spec.ts` checks that it loads lazily, resets,
   and makes no `/api` or third-party requests). The same spec drives the
   real Posts and Notebook demos on the built site
5. Production builds of the admin and Notebook apps (`vite build` into
   `e2e/.stack/<run>/dist-*`, real Amplify, Cognito settings from
   `E2E_COGNITO` in `e2e/stack.ts`) served by `vite preview`.
   `tests/app-auth.spec.ts` signs in to these through a stubbed managed login
   on `https://auth.e2e.test` (routed in the browser; nothing leaves the
   machine). `tests/apex-cutover.spec.ts` serves the built site as
   `https://gagnechris.com` the same way, to check that the public bundle
   deletes leftover `CognitoIdentityServiceProvider.*` cookies and
   `localStorage` keys

Each dev server answers every page route, `*.html` included, with its own
app's shell, so the public server never loads `admin.html` or
`notebook.html`. Teardown fails the run if a dev server logged
`dependencies optimized:` or `optimized dependencies changed`: it met a
dependency its start-up scan missed, re-bundled, and may have reloaded every
open page mid-test. That only happens with a cold `node_modules/.vite` cache,
which CI always has.

Every port is picked by the OS unless set, so a run never collides with
`npm run local:dev` (8000/8787/4177/5173-5175), another worktree, or another
run. No Compose project is used.

| Env                                                  | Default                                              |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `E2E_DYNAMODB_PORT`                                  | free port                                            |
| `E2E_DYNAMODB_ENDPOINT`                              | unset; when set, reuse that DynamoDB                 |
| `E2E_API_PORT`                                       | free port                                            |
| `E2E_SITE_PORT`                                      | free port                                            |
| `E2E_PUBLIC_PORT` / `_ADMIN_PORT` / `_NOTEBOOK_PORT` | free ports (dev servers, fake auth)                  |
| `E2E_ADMIN_AUTH_PORT` / `E2E_NOTEBOOK_AUTH_PORT`     | free ports (production builds, stubbed Cognito)      |
| `E2E_OUTPUT_DIR`                                     | `e2e/` (holds `test-results/`, `playwright-report/`) |

Playwright wipes its output dir on start, so give concurrent runs in the
same checkout different `E2E_OUTPUT_DIR`s. Process logs go to
`e2e/.stack/<run>/*.log`; they are deleted after a local run and kept in CI.
If a run is killed hard, remove leftovers with
`docker rm -f $(docker ps -q --filter label=gagnechris.e2e=1)` (only when no
other run is active).

### Writing specs

Import `test` and `expect` from `e2e/fixtures.ts`:

| Fixture  | What it gives you                                                                       |
| -------- | --------------------------------------------------------------------------------------- |
| `apps`   | `{ public, admin, notebook }` dev-server origins; `page.goto(apps.notebook + '/today')` |
| `prefix` | Unique per test; slugs and titles from `seed` start with it                             |
| `users`  | `owner` and `other`, two distinct admins (`sub` = `<prefix>-owner/-other`)              |
| `signIn` | `await signIn(user?)` before `page.goto`; defaults to `users.owner`                     |
| `pageAs` | `await pageAs(user)` returns a page in a separate signed-in context                     |
| `seed`   | API seeding as `users.owner` (`seed.post()`, `seed.note()`, `seed.api`)                 |
| `seedAs` | `seedAs(user)` seeds as another user                                                    |

Fake sign-in writes `{ userId, label, groups? }` to `localStorage['gagnechris.localAuthUser']`; without `groups` the user is in `site-admin` and `notebook`.
In `VITE_AUTH_MODE=local` the admin and Notebook apps read that user (default `local-dev-user`)
and sends `Authorization: Bearer local:<userId>`; the local API turns that
into ID-token claims with `sub=<userId>` for the matched route's app
(`site-admin` on `/api/admin`, `notebook` on `/api/notebook`), so
owner-scoped notebook data is separate per user. Any other bearer, or none, is the default user.

All tests share one stack and table, so isolate by `prefix` and per-test
users rather than assuming an empty table. Seeding goes through the API
(`@gagnechris/api-client`), so it hits the same validation as the UI.
Indexes such as `/posts` and `/projects` list every test's items, so a
keyboard check calls `focusJustBefore(locator)` (from `e2e/fixtures.ts`) and
presses Tab once, rather than tabbing from the top of the page.

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

This starts DynamoDB Local (if needed), bootstraps `gagnechris-local`, seeds a publisher shell, runs the API wrapper (`:8787`) and static origin (`:4177`), rebuilds published HTML, and starts the three Vite servers with `VITE_AUTH_MODE=local`: public `:5173`, admin `:5174`, Notebook `:5175`. Each proxies `/api` → API; the public one also proxies `/__site` and `/resume.pdf`, and the admin one `/media`, → static origin (which applies the prod CloudFront viewer-request routing).

Open `http://localhost:5174` for the CMS and `http://localhost:5175` for Notebook. After publish, `http://localhost:5173/posts/<slug>` uses the Vite public app (with HMR). `PostPage` loads publisher HTML via `/__site/posts/<slug>/` (proxied to `:4177`). Ctrl+C stops Vite and processes this script started (Docker stays up).

Optional: `npm run build && npm run local:seed-shell` once if you want full SPA assets in the publisher shell.

### Resume CMS

`http://localhost:5174/resume` edits the singleton resume draft. The first
`GET` seeds a **draft** from `DEFAULT_RESUME` (no live rebuild). Publish copies
the draft to the `PUBLISHED` snapshot and rebuilds
`.local-site/resume/index.html` + `.local-site/resume.pdf`. Autosave updates the
draft only. The public page at `http://localhost:5173/resume` fetches
`/__site/resume/` and falls back to `DEFAULT_RESUME` when no published HTML
exists. Download uses `/resume.pdf` (Vite proxies that path to the local site
origin).

### Home CMS

`http://localhost:5174/home` edits the header (name + title) and the
About Me copy. Like the resume, the first `GET` seeds a **draft** and does not
rebuild. Publish writes the `PUBLISHED` snapshot so `.local-site/index.html`
gets the `home-page-prerender` article. The public page at
`http://localhost:5173/` fetches `/__site/` and falls back to `DEFAULT_HOME`.
Publishing, unpublishing or deleting a post also rebuilds `.local-site/index.html`
so its Recent posts list stays current; this works before Home is ever
published (the page renders `DEFAULT_HOME`). The hero links sentence comes from
shared `HOME_LINKS_SENTENCE`, and the site header and footer from
`@gagnechris/shared/site-chrome` (React JSX + publisher HTML).

The publisher reads a pristine `_shell.html` template (never the home
prerender in `index.html`) when building other pages. `npm run e2e:local`
asserts both halves: `/` has the home prerender and `/posts/<slug>` does not.

Lower-level scripts (`local:up`, `local:api`, `local:site`, …) run the pieces separately.

### Safety

| Guard                  | Behavior                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| Default Vite `/api`    | Proxies to `http://127.0.0.1:8787`, not prod                       |
| `VITE_API_TARGET=prod` | Opt-in only; admin and Notebook show a **PRODUCTION** banner       |
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
| `.local-kvs.json`                     | Stand-in for the slug KeyValueStore (gitignored)        |

Publisher uses `SITE_STORAGE=filesystem` locally; the prod Lambda uses S3 + CloudFront invalidation. Locally the publisher writes the slug KeyValueStore keys to `LOCAL_KVS_FILE` (set by `env.sh`), and the static server answers the viewer-request function's KVS reads from it. Like CloudFront, the static server runs viewer-response only on responses below 400.
